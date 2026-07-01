# Doodaboo Desktop (Tauri)

The desktop app is a [Tauri 2](https://tauri.app/) wrapper around the
same Next.js code base the web build uses. It produces a small,
signed-where-supported native binary for macOS, Windows, and Linux that
runs against a vault on the user's disk — no cloud, no account.

## Prerequisites

| Platform | What you need                                                         |
| -------- | --------------------------------------------------------------------- |
| All      | Node 22, npm, [Rust 1.78+](https://www.rust-lang.org/tools/install)   |
| macOS    | Xcode Command Line Tools (`xcode-select --install`)                   |
| Windows  | Microsoft C++ build tools (Visual Studio installer → "C++ workload")  |
| Linux    | `libwebkit2gtk-4.1-dev libdbus-1-dev libsoup-3.0-dev libssl-dev`      |

Then install the Tauri CLI:

```bash
npm install --save-dev @tauri-apps/cli
```

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

Produces installers under `src-tauri/target/release/bundle/`:

- macOS: `.app`, `.dmg`
- Windows: `.msi`, `.exe` (NSIS)
- Linux: `.AppImage`, `.deb`, `.rpm`

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

Drop branded icons into `src-tauri/icons/` then regenerate:

```bash
npx @tauri-apps/cli icon path/to/icon.png
```

This populates every platform-specific size Tauri's bundler expects.

## Roadmap

- ✅ **Shipped** — frontend storage adapter that auto-detects Tauri and
  routes through `invoke('vault_save')` instead of localStorage
  (`src/lib/tauri-storage.ts`, wired in `src/lib/store.ts`), so the
  desktop app reads/writes the vault directly without the bundled API
  server.
- Auto-update channel via `tauri-plugin-updater` (requires generating
  and configuring an update signing keypair).
- Mobile builds (iOS / Android) — the storage adapter now exists, and
  Tauri 2 already supports mobile targets.
