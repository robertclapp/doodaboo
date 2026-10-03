# Doodaboo Cloud (Convex)

Cloud mode gives Doodaboo accounts, shared workspaces and live sync, on top
of a [Convex](https://convex.dev) deployment. It is a property of a *build*:
set `NEXT_PUBLIC_CONVEX_URL` and the app signs people in and mirrors a cloud
workspace; leave it unset and the app is exactly the local-first product it
always was — localStorage on the web, the vault on desktop and mobile. The
same pages, components and routes serve both modes.

## How it works

- **Backend** — `convex/`. Workspaces, members (owner / member), invite
  links, and the app's labels / projects / tasks / posts keyed by the same
  ids they have locally. Auth is [Convex Auth](https://labs.convex.dev/auth)
  with an email + password provider (12–128 character passwords, normalized
  emails, sign-up refused for an existing address so it cannot be used to
  guess passwords).
- **One business-rules implementation** — every edit is an *op*
  (`src/lib/ops.ts`) naming one of the pure mutations in
  `src/lib/mutations.ts`. The browser applies the op optimistically and the
  server replays it (`convex/workspace.ts` → `apply`), with the caller as
  the actor and a client-drawn seed for ids and timestamps, so both sides
  produce the same record and navigating to a just-created id is safe.
  Deletes go to a server-side trash (7 days) so "Undo" restores the server's
  copy, never a client-supplied one.
- **Authorization** — every function re-reads membership; roles are never
  in the token. Destructive ops (deleting a project, removing a label,
  replacing all content, deleting the workspace) are owner-only.
- **The local vault is never touched** — a cloud session persists only the
  theme (under `doodaboo-cloud-prefs`); `doodaboo-v1` and the desktop vault
  stay as the last local session left them, so a device can switch back.
- **No deployment reachable?** The connection banner says so after a few
  seconds, counts queued edits (Convex holds them in memory until the socket
  returns — a reload loses them), and offers *Work locally on this device*,
  which sets `localStorage["doodaboo-mode"] = "local"` and reloads into
  local mode. Settings → Cloud has the same switch, and the way back.

## Set up a deployment (owner checklist)

Local development:

1. `npx convex dev` — log in, create a project. It writes `.env.local`
   (`CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`; gitignored), pushes the
   functions and rewrites `convex/_generated/` in its canonical form —
   commit that result. It keeps the existing `convex/tsconfig.json`.
2. `npx @convex-dev/auth --web-server-url http://localhost:3000` — sets
   `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL` on the deployment. The repo's
   `convex/auth.ts`, `auth.config.ts` and `http.ts` differ from the
   template on purpose (the hardened provider); accept the prompts that
   keep them.
3. `npx convex run health:crypto` — expect `getRandomValues: true`.
4. `npm run dev` and sign up. The first account creates its workspace from
   the picker; *Upload this device's local workspace* copies what local mode
   held on that device (your local user becomes you; other local members'
   assignments are dropped, history is kept).

Production:

5. In the Convex dashboard create a production deployment and a deploy key
   → `CONVEX_DEPLOY_KEY` secret in your host.
6. **Vercel**: build command `npx convex deploy --cmd 'npm run build'` (it
   injects the production `NEXT_PUBLIC_CONVEX_URL` into the build).
   **Railway** (see `railway.json`): set `NEXT_PUBLIC_CONVEX_URL` to the
   production `https://<slug>.convex.cloud` URL as a *build-time* variable
   and run `npx convex deploy` from CI on pushes to `main`
   (`CONVEX_DEPLOY_KEY` in the environment).
7. Set `SITE_URL` on the production deployment to the public app URL
   (used for OAuth / magic-link redirects, should you add a provider).
8. Smoke: sign up, create a workspace, open an invite link in a second
   browser, make an edit on each side and watch it appear on the other.

Desktop and mobile bundles are local-first by default. `npm run build:tauri`
drops `NEXT_PUBLIC_CONVEX_URL` from the build environment and refuses a
bundle that references a deployment; to ship a cloud-connected app run it
with `DOODABOO_TAURI_CLOUD=1` and the URL set. Sign-in from the Tauri origin
(`tauri://localhost` on macOS/iOS, `http://tauri.localhost` on Windows/
Android) is an HTTP POST to the deployment; confirm sign-up works in the
webview on each platform before releasing.

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Next build (web host, or `DOODABOO_TAURI_CLOUD=1` Tauri build) | The deployment URL (`https://<slug>.convex.cloud`). Unset → local-first. A malformed value or a `.convex.site` URL is rejected at boot: the app stays local-first and Settings → Cloud shows why. |
| `CONVEX_DEPLOYMENT` | `.env.local` (dev only) | Which dev deployment `npx convex dev` targets. |
| `CONVEX_DEPLOY_KEY` | CI / host secret | Lets `npx convex deploy` push to production. |
| `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` | The Convex deployment (set by `npx @convex-dev/auth`) | Token signing and redirect base. Never part of the Next build. |

Nothing but `NEXT_PUBLIC_CONVEX_URL` is baked into the client.

## What changes in cloud mode

- Team: members are accounts. Owners create **invite links** (single use,
  7 days; whoever opens one while signed in joins — the email on an invite
  is a note, not a check, because password accounts never prove they own
  their address). Owners can remove members (assignments are cleared),
  transfer ownership, and revoke invites. Everyone edits their own profile.
- Settings: the Import and local Danger-zone actions become *Replace
  content from a JSON export* (owner), *Leave workspace*, *Delete
  workspace* (owner), and the device-level *Work locally* switch.
- The HTTP API (`/api/*`) is disabled on a cloud-mode web deployment
  (503) except `/api/health`; `doodaboo serve` on loopback still works. The
  CLI and API are the local-vault surface.
- Theme stays a device preference; it is not synced.

## Content-Security-Policy

The app sets no CSP today. If one is added (`headers()` in `next.config.mjs`,
or `app.security.csp` in `src-tauri/tauri.conf.json`), it must allow
`connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site`
or sign-in and every query fail with an opaque error.

## Verification without a deployment

| Check | Command |
| --- | --- |
| Backend functions, real auth flow, membership, op replay | `npm run test:convex` (convex-test + vitest, RSA key generated per run) |
| Op protocol, seeded determinism, read scopes | `npm test` (`src/lib/ops.test.ts`) |
| Cloud shell without a server: gate, untouched vault, banner, escape hatch | `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:9 npm run build && E2E_TARGET=cloud-offline npm run e2e` |
| The cloud path compiles | `NEXT_PUBLIC_CONVEX_URL=https://example-123.convex.cloud npm run build` |
| Generated types without a deployment | `npm run convex:codegen:offline` (writes `convex/_generated/` from the CLI's own templates; `npx convex dev` rewrites it in canonical form) |

CI runs all of these. Anything that needs a live deployment — the smoke
steps above — is the owner's, once per environment.

## Limits and follow-ups

- A workspace is one reactive query (`workspace.get`): every member
  receives the whole workspace on each change. Fine at this app's scale;
  splitting into per-collection queries changes nothing in the op protocol.
- Comments, activity and snapshots are embedded in their record (as locally).
  Activity is capped at 4,000 entries per task server-side.
- Password only. OAuth providers plug into `convex/auth.ts` with their
  secrets on the deployment.
- Queued edits while offline live in memory; the banner and the
  before-unload warning say so.
