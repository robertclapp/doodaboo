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
  guess passwords, and one "Wrong email or password" answer for an unknown
  email and a wrong password alike).
- **One business-rules implementation** — every edit is an *op*
  (`src/lib/ops.ts`) naming one of the pure mutations in
  `src/lib/mutations.ts`. The browser applies the op optimistically and the
  server replays it (`convex/workspace.ts` → `apply`), with the caller as
  the actor and a client-drawn seed for ids and timestamps, so both sides
  produce the same record and navigating to a just-created id is safe.
  Deletes go to a server-side trash (7 days) so "Undo" restores the server's
  copy, never a client-supplied one. The trash holds one row per record (a
  deleted project's issues each get their own, grouped under the project),
  and while a row exists its id is reserved, so nothing new can take it and
  turn a later Undo into a silent no-op. An issue whose project was deleted
  comes back with the project, not on its own. One delete (and its Undo)
  moves at most 3,000 issues or 5 MB; a larger project is refused with a
  message saying so. Expired trash is purged daily in budgeted passes that
  keep going until the backlog is gone.
- **Concurrent edits** — a post's content and context travel as the
  changed sub-fields, and a task's labels and a project's members as
  additions and removals, merged into the server's current record. Two
  people editing different parts of the same record both keep their change;
  the same field is last-writer-wins.
- **Authorization** — every function re-reads membership; roles are never
  in the token. Destructive ops (deleting a project, removing a label,
  replacing all content, renaming or deleting the workspace) are owner-only,
  and members do not see those controls. A cloud build never writes to its
  in-memory mirror without a live connection to the workspace: a write is
  refused rather than allowed to vanish on the next sync.
- **The local vault is never touched** — a cloud session persists only the
  theme (under `doodaboo-cloud-prefs`); `doodaboo-v1` and the desktop vault
  stay as the last local session left them, so a device can switch back.
- **No deployment reachable?** The connection banner says so after a few
  seconds, counts queued edits (Convex holds them in memory until the socket
  returns — a reload loses them), and offers *Work locally on this device*
  (after a confirmation), which sets `localStorage["doodaboo-mode"] =
  "local"` and reloads into local mode. Settings → Cloud has the same
  switch; while the device works locally, Settings shows *Use the cloud
  workspace again*, and an invite link offers to switch back and open it.
- **Signing out offline** — the server is told when it can be; if it
  cannot be reached within a few seconds the device forgets its session
  locally, so a shared device always gets back to the sign-in screen.

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
   assignments are dropped; their comments and activity are kept but shown
   as from a former member — an import can never attribute history to a
   real account). Records are cleaned of fields the cloud does not store
   (vaults edited through the HTTP API can carry some) before upload.

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
works out the URL Next would inline (environment and `.env` files, so the
`.env.local` that `npx convex dev` writes counts), builds with it pinned to
empty, and refuses a bundle that still references it; to ship a
cloud-connected app run it with `DOODABOO_TAURI_CLOUD=1`. A cloud desktop or
mobile app cannot make browser links from its own `tauri://` origin: set
`NEXT_PUBLIC_SITE_URL` to the public web app when building it and invites
are shared as links to that site; without it they are shared as invite
codes, which the recipient pastes into *Join with an invite* on their
workspace picker. Sign-in from the Tauri origin
(`tauri://localhost` on macOS/iOS, `http://tauri.localhost` on Windows/
Android) is an HTTP POST to the deployment; confirm sign-up works in the
webview on each platform before releasing.

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Next build (web host, or `DOODABOO_TAURI_CLOUD=1` Tauri build) | The deployment URL (`https://<slug>.convex.cloud`). Unset → local-first. A malformed value or a `.convex.site` URL fails `next build` (and `next dev`) with an explanation. |
| `NEXT_PUBLIC_SITE_URL` | Next build | The public web app's URL. Used for metadata, and as the origin of invite links made from a cloud desktop/mobile app. |
| `CONVEX_DEPLOYMENT` | `.env.local` (dev only) | Which dev deployment `npx convex dev` targets. |
| `CONVEX_DEPLOY_KEY` | CI / host secret | Lets `npx convex deploy` push to production. |
| `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` | The Convex deployment (set by `npx @convex-dev/auth`) | Token signing and redirect base. Never part of the Next build. |

Nothing but these two public URLs is baked into the client.

## What changes in cloud mode

- Team: members are accounts. Owners create **invite links** (single use,
  7 days; whoever opens one while signed in joins — the email on an invite
  is a note, not a check, because password accounts never prove they own
  their address). The token is in the link's `#fragment`, so it never
  reaches the web host's request logs, and it is removed from the address
  bar whatever the recipient chooses. A link works only while the person
  who made it is still an owner: removing someone, their leaving, or their
  handing over ownership revokes the links they made, and the pending list
  shows who made each one. Someone who is already a member and opens a link
  is offered *Open* instead of *Join*; the link stays unused for its
  recipient. A workspace can have at most 50 open links, and invites are
  deleted once they expire. A link is a bearer credential: a removed member
  who is handed a link someone else made can rejoin with it, so revoke
  pending links you no longer want used.
  Owners can remove members (assignments are cleared), transfer ownership,
  and revoke invites. Everyone edits their own profile.
- Settings: the Import and local Danger-zone actions become *Replace
  content from a JSON export* (owner; refused if the workspace already
  holds more than 3 MB — import into a new workspace instead), *Leave
  workspace*, *Delete workspace* (owner; access ends at once and the
  content is cleared in the background), and the device-level *Work
  locally* switch.
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
| Cloud shell without a server: gate, untouched vault, banner, escape hatch and the way back | `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:9 npm run build && E2E_TARGET=cloud-offline npm run e2e` |
| Tauri bundles stay local-first with a `.env.local` present | `npm run build:tauri` with a `.env.local` holding a URL (CI does exactly this) |
| The cloud path compiles | `NEXT_PUBLIC_CONVEX_URL=https://example-123.convex.cloud npm run build` |
| Generated types without a deployment, and no drift | `npm run convex:codegen:offline && git diff --exit-code -- convex/_generated` (writes `convex/_generated/` from the CLI's own templates; `npx convex dev` rewrites it in canonical form) |

CI runs all of these. Anything that needs a live deployment — the smoke
steps above — is the owner's, once per environment.

## Size limits

A cloud workspace is shared and is served to every member through one
reactive query, so records have caps that local mode does not
(`src/lib/limits.ts`). They are generous for real use — a seed issue is
~450 bytes:

| Record | Caps |
| --- | --- |
| Issue | title 300 characters, description 20,000, 50 labels, 500 comments of up to 5,000 characters |
| Project | key 12, name 120, description 10,000, 500 members |
| Post | title 300, hook 1,000, caption 5,000, transcript 30,000, 60 hashtags of up to 100, 500 snapshots |
| Label | name 60 |
| Any record | 256 KB as Convex measures it (Convex's own document limit is 1 MiB) |
| One import | 8 MB in total |

The server checks every record a write produces and refuses an edit that
would break a cap with a readable message; the browser runs the same check
before sending, so the message appears immediately. Activity is
system-generated history, so instead of being refused it is trimmed to the
newest 1,000 entries per issue.

Convex fails any function that reads more than 16 MiB. `workspace.get`
therefore reads against a 12 MiB budget and, should a workspace ever outgrow
it, returns the newest records that fit and names the collections it cut;
the app shows a notice saying what is hidden (exports are partial too)
instead of failing to load for everyone. Edits keep working on the full
data, because writes only read the records they touch.

## Limits and follow-ups

- A workspace is one reactive query (`workspace.get`): every member
  receives the whole workspace on each change. Fine at this app's scale;
  splitting into per-collection queries changes nothing in the op protocol
  and would lift the read budget above.
- Comments, activity and snapshots are embedded in their record (as locally).
- Password only. OAuth providers plug into `convex/auth.ts` with their
  secrets on the deployment.
- Queued edits while offline live in memory; the banner and the
  before-unload warning say so.
