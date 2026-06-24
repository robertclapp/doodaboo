# Doodaboo Ops

Recurring, hands-off work that keeps the project honest without you having
to remember to run it.

## What runs automatically

| When | Workflow | What it does |
| --- | --- | --- |
| Every push / PR | `.github/workflows/ci.yml` | verify (typecheck + lint + unit) → e2e on a separate job. Comments failure summaries on the PR. |
| Daily 06:00 UTC | `.github/workflows/scheduled.yml` → `verify` | Full verify + e2e against `main`. Catches dep drift, time-sensitive seeds, Playwright browser-cache misses. Opens an `ops:nightly`-labelled issue on failure (reuses one issue/day rather than spamming). |
| Mondays 09:00 UTC | `.github/workflows/scheduled.yml` → `tauri-sanity` | `cargo check` for the Tauri crate on Linux / macOS / Windows. Catches Tauri version drift, system-lib breakage on the Linux build agents, Rust toolchain regressions. Opens an `ops:tauri` issue on failure. |
| Tag push `v*` | `.github/workflows/release.yml` | Builds signed Tauri binaries for all four platform targets, drafts a GitHub release with installers + updater JSON. |

Trigger any of them manually from the **Actions** tab in GitHub:

```text
Actions → "Scheduled" → Run workflow → pick job: verify | tauri-sanity | audit
```

The `audit` job is workflow-dispatch only — run it before tagging a
release.

## Active-session loops (`/loop`)

When you're working in Claude Code, the `/loop` skill re-runs a prompt
or slash command on an interval. Useful for live babysitting tasks
that don't justify a permanent workflow:

```text
/loop 10m check CI on the latest commit and fix any failure inline
/loop 30m run npm run verify and report regressions
/loop 1h hit http://localhost:3100/api/posts?score=1 and surface any post that crossed into "Hot" or "Rocket"
/loop 6h fetch /api/health from each environment and warn if any returns ok:false
```

`/loop` only runs while the Claude Code session is active — if you
close the laptop, it stops. Use the scheduled workflow for things that
should keep running when you're away.

## Multi-agent orchestration (`ultracode`)

Including the word `ultracode` in a message opts that turn into
multi-agent mode. I'll fan independent work out to parallel agents,
each in its own git worktree so they can't trample each other's files.
The session that built the dashboard + report commands started with:

> "ultracode: build the `doodaboo dash` and `doodaboo report` commands
> in parallel."

Each agent ran in isolation, finished, reported back; I merged the
results and committed once both passed `npm run verify`.

Patterns this is good for in doodaboo:

- **Parallel feature builds** — two non-overlapping commands or pages.
- **Audit fan-out** — one agent reads `src/lib`, one reads `cli/`, one
  reads `src/app/api`. Wall-clock time drops to the slowest lane.
- **Plan-then-execute** — a `Plan` agent designs, an `Explore` agent
  maps file impact, then I implement against both outputs.

Don't use it for sequential work that has to thread a result through —
parallel agents can't see each other's output until they finish.

## When you change ops infrastructure

- `ci.yml` and `release.yml` run on push events — your next push will
  exercise the change. Watch the Actions tab.
- `scheduled.yml` doesn't run on push; trigger it via workflow-dispatch
  after editing so you don't wait 24 hours to discover it's broken.

## Common failure-mode playbook

| Symptom | First check |
| --- | --- |
| Nightly verify fails but local does not | Check `actions/setup-node` cache against the lockfile hash; dependency might've shifted under your feet. |
| Tauri sanity build fails on Linux only | New `webkit2gtk` / `dbus` version on `ubuntu-22.04`. Pin the runner to a specific version or update the apt install list. |
| E2E job times out at "Run Playwright tests" | Browser-cache miss means a re-download; check if Playwright bumped its bundled Chromium version. |
| `npm audit` flags a transitive dep | Run `npm audit fix` locally and verify; never accept `npm audit fix --force` without reading the diff. |
