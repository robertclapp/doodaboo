# Doodaboo Desktop & Mobile (Tauri)

The desktop app is a [Tauri 2](https://tauri.app/) wrapper around the
same Next.js code base the web build uses. It produces a small,
signed-where-supported native binary for macOS, Windows, and Linux that
runs against a vault on the user's disk — no cloud, no account. The same
crate builds for Android and iOS; see [Mobile](#mobile-android--ios).

## Prerequisites

| Platform | What you need                                                         |
| -------- | --------------------------------------------------------------------- |
| All      | Node 22, npm, [Rust 1.88+](https://www.rust-lang.org/tools/install)   |
| macOS    | Xcode Command Line Tools (`xcode-select --install`)                   |
| Windows  | Microsoft C++ build tools (Visual Studio installer → "C++ workload")  |
| Linux    | `libwebkit2gtk-4.1-dev libdbus-1-dev libsoup-3.0-dev libssl-dev`      |

`npm install` brings in the Tauri CLI (`@tauri-apps/cli` is a devDependency).

## Develop

```bash
npm run tauri:dev
```

Spawns `npm run dev` (the Next.js dev server on port 3000), waits for
it, then launches a Tauri webview pointing at it. Reloads on change.

## Build a native bundle

```bash
npm run tauri:build
```

`tauri build` first runs `npm run build:tauri` (its `beforeBuildCommand`)
to produce the frontend as a static export in `./out`, then compiles the
Rust crate and bundles the two. Installers land under
`src-tauri/target/release/bundle/`:

- macOS: `.app`, `.dmg`
- Windows: `.msi`, `.exe` (NSIS)
- Linux: `.AppImage`, `.deb`, `.rpm`

### The static export

Tauri embeds files and runs no server, so what it ships is a Next.js static
export — which has a stricter contract than the web build:

- **No server-only surfaces.** `scripts/build-tauri.mjs` parks the HTTP API
  (`src/app/api`), `src/middleware.ts`, and the PWA/SEO metadata routes
  outside `src/` for the duration of the build and restores them afterwards:
  on success, on failure, on Ctrl-C, and at the start of the next run if a
  previous one was killed outright. `npm run tauri:restore` repairs the tree
  by hand. Nothing inside the app uses those files — the UI persists through
  `invoke("vault_save")`, never HTTP. Don't run `next dev` in another
  terminal while `build:tauri` runs; it would briefly see the API vanish.
  If something is written to a parked path while it is parked (an editor
  save, a `git restore` after a hard kill), restore never deletes it: the
  tree copy is moved to `.tauri-build-stash/conflicts/` with a warning, for
  you to reconcile.
- **No dynamic route segments.** Record pages are addressed by query
  (`/posts/view?id=…`), never by path (`/posts/<id>`). Tauri's asset resolver
  tries `path`, `path.html`, `path/index.html`, then falls back to the root
  `index.html` — it never 404s — so a path the export doesn't contain renders
  the *dashboard* at the wrong URL. Every URL is built through
  `src/lib/routes.ts`, which explains this in full.
- **Validated, not assumed.** The script fails if any page the app links to
  is missing from `out/`, if a `[id]` or placeholder page leaked in, if an
  `api/` directory was built, or if a parked path did not come back.

`next.config.mjs` switches to `output: "export"` only when
`DOODABOO_STATIC_EXPORT=1`, which only that script sets. `npm run dev` (what
`tauri dev` runs against) and the web build are unchanged. The export does
reuse the web build's `.next` directory (Next only writes to `./out` from the
default `distDir`), so after `build:tauri` run `npm run build` again before
`npm start` — a `next start` on the export build would serve the app
without its API, middleware, headers and redirects.

### Proving it without a webview

```bash
npm run build:tauri
E2E_TARGET=export npm run e2e
```

runs the whole Playwright suite against `./out` served by
`scripts/serve-export.mjs`, which implements Tauri's exact fallback chain
(and strips the query string before lookup, as Tauri does). CI runs the
suite both against `next start` and against the export; both passing is the
guarantee the web and Tauri builds do not diverge. `e2e/tauri-export.spec.ts`
replays the specific failure this design prevents.

## Where data lives

Tauri exposes the same vault layout as the CLI:

```
~/.doodaboo/
  workspace.json
  backups/
  plugins/
  exports/
```

Override with `DOODABOO_VAULT=/path/to/vault npm run tauri:dev`.

The desktop binary launches with `vault_init` to ensure the vault
scaffolding exists, then mirrors the CLI's atomic write semantics for
every save (temp-file-then-rename + rolling backups).

## Sync your vault

Treat the vault directory like an Obsidian vault — sync however you
already sync files:

- iCloud, Dropbox, Google Drive (just put `~/.doodaboo` in your sync
  folder, or symlink to it).
- Git: `cd ~/.doodaboo && git init && git add . && git commit`. The
  vault watcher picks up external writes within ~80 ms.
- [Syncthing](https://syncthing.net/), Resilio, etc.

`workspace.json` is line-pretty JSON with stable key ordering so diffs
on Git stay readable.

## Icons

The source of truth is `src-tauri/app-icon.svg` — the web favicon's
monospace "D" on ink, drawn as paths so it rasterizes without any font.
Every platform-specific size under `src-tauri/icons/` (desktop PNG/ICNS/ICO,
Android mipmaps, iOS AppIcon set) is generated from it and committed, because
`tauri::generate_context!()` reads `icons/icon.png` at compile time and the
crate will not even `cargo check` without it.

To change the icon, edit the SVG and regenerate:

```bash
npx tauri icon src-tauri/app-icon.svg --ios-color '#0a0a0a'
```

`--ios-color` fills the iOS icon's background, which must be opaque.

## Mobile (Android / iOS)

The Rust crate is mobile-ready — `#[tauri::mobile_entry_point]`, the
static/dynamic library crate types Android and iOS link against, and a vault
that lives in the app's sandboxed data directory (there is no home directory
on a phone) — and the icon sets are generated. What a mobile build needs
beyond that is a toolchain: the Android SDK and NDK, or Xcode on macOS. Those
aren't assumed to exist on a developer machine, so the builds are **proven in
CI**: `.github/workflows/mobile.yml` builds an unsigned debug APK on Ubuntu
and an unsigned simulator `.app` on macOS — weekly, on demand, and on any
change to `src-tauri/**` or the export pipeline — and uploads both as run
artifacts. Neither needs signing secrets.

Locally, with a toolchain installed:

```bash
npx tauri android init && npx tauri android build --debug --apk
npx tauri ios init && npx tauri ios build --target aarch64-sim --debug --no-sign   # macOS only
```

`src-tauri/gen/` (the generated Android Studio and Xcode projects) is
gitignored and regenerated by `init`. Commit `gen/android` or `gen/apple`
only once they need hand edits — release signing config, extra manifest
permissions — by narrowing `.gitignore` from `src-tauri/gen` to
`src-tauri/gen/schemas`; the schemas directory is rewritten by `tauri-build`
on every compile and stays ignored, as in Tauri's own template.

`identifier` in `tauri.conf.json` is `com.doodaboo.workspace`. It becomes the
Android package and the iOS bundle id, and changing it later invalidates the
generated projects and relocates every mobile install's data directory, so
settle it before the first release. (The previous `com.doodaboo.app` made
the Tauri CLI warn on every build: a `.app` suffix collides with the macOS
bundle extension.)

Where data lives on mobile: the equivalent of `~/.doodaboo` is
`<app data dir>/vault` inside the app's sandbox, resolved through Tauri's
path API. Desktop is unchanged.

## Roadmap

- ✅ **Shipped** — frontend storage adapter that auto-detects Tauri and
  routes through `invoke('vault_save')` instead of localStorage
  (`src/lib/tauri-storage.ts`, wired in `src/lib/store.ts`), so the
  desktop app reads/writes the vault directly; the Tauri bundle contains
  no HTTP API at all (see "The static export" above).
- ✅ **Shipped** — Android and iOS builds, proven in CI on every native or
  export-pipeline change (`.github/workflows/mobile.yml`). Store
  distribution (signing, Play/App Store upload) is the remaining step and
  needs credentials.
- Auto-update channel via `tauri-plugin-updater` (requires generating
  and configuring an update signing keypair).
