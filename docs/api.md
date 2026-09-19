# Doodaboo HTTP API

The Next.js app exposes a small REST API mounted under `/api/`. Every
route reads/writes the vault on disk pointed at by `DOODABOO_VAULT`
(default `~/.doodaboo`). Each request is a load-mutate-save cycle, so
concurrent edits from the web UI, the CLI, and external integrations
all converge on the same `workspace.json`.

All routes:

- run on the Node.js runtime (no Edge),
- return `application/json; charset=utf-8`,
- never cache (`Cache-Control: no-store`),
- emit `{ "error": "..." }` bodies on non-2xx responses.

## Authentication

Set `DOODABOO_API_TOKEN` and every route except `/api/health` requires a
bearer token:

```bash
curl -H "Authorization: Bearer $DOODABOO_API_TOKEN" \
  https://your-app.up.railway.app/api/workspace
```

Responses are `401` with `WWW-Authenticate: Bearer realm="doodaboo"` when
the token is missing or wrong. Error bodies never include workspace data.

**The token is required in production.** With `NODE_ENV=production` and no
`DOODABOO_API_TOKEN`, the API refuses every request with `503` and a message
naming the variable. That is deliberate: these routes read and write the
whole workspace, so a deployment with a persistent vault volume would
otherwise let anyone with the URL dump it via `GET /api/workspace` or replace
it with `PUT`. Failing loudly beats a silent open door.

Locally (`npm run dev`, tests, `doodaboo serve` against your own vault) the
API stays open when no token is set, so nothing changes for personal use.

`/api/health` is always reachable without credentials — Railway's healthcheck
cannot present a token, and a deploy that 401s its own healthcheck never goes
live. It exposes no workspace data.

Enforcement lives in `src/middleware.ts` (matching `/api/:path*`) rather than
in each route, so a newly added route is protected by default; the policy
itself is in `src/lib/api-auth.ts`.

## Endpoints

### Health

```
GET /api/health
→ 200 { ok, vault, version, reason? }
```

### Workspace

```
GET /api/workspace             # full workspace state
PUT /api/workspace             # replace entire workspace (use carefully)
```

### Projects

```
GET    /api/projects                    # all projects
POST   /api/projects                    # body: { name, key, description?, ... }
GET    /api/projects/:id                # { project, tasks }
PATCH  /api/projects/:id                # partial update
DELETE /api/projects/:id                # cascades to project's tasks
```

### Tasks

```
GET    /api/tasks?project=ID&status=…&assignee=…
POST   /api/tasks                       # body: { projectId, title, ... }
GET    /api/tasks/:id
PATCH  /api/tasks/:id                   # patch fields; { comment } also appends a comment
DELETE /api/tasks/:id
```

### Posts

```
GET    /api/posts?platform=…&status=…&score=1
POST   /api/posts                       # body: { title, platform, content?, context?, ... }
GET    /api/posts/:id
PATCH  /api/posts/:id
POST   /api/posts/:id                   # duplicate as A/B variant draft
DELETE /api/posts/:id
```

### Snapshots

```
GET  /api/posts/:id/snapshots
POST /api/posts/:id/snapshots
     # body: { atMinutes, impressions, views, likes, comments, shares, saves,
     #         retentionPct?, watchTimeAvgSec? }
```

### Score

```
GET /api/posts/:id/score
→ { intrinsic, live, projection, recommendations }
```

`intrinsic` is the pre-publish quality score; `live` blends in
engagement signals from snapshots; `projection` extrapolates whether
the post will hit its threshold within the configured window;
`recommendations` lists actionable next edits with estimated point gain.

### Playbooks

```
GET  /api/playbooks                     # full library
GET  /api/playbooks/:id
POST /api/playbooks/:id                 # body: { postId } — apply playbook
                                        # → { changes, postId, playbookId }
```

### Hooks

```
POST /api/hooks                         # body: { subject, audience?, platform? }
                                        # → variants[] with template family info
```

### Plugins

```
GET /api/plugins                        # inventory of installed plugins
```

Plugin-defined HTTP routes (declared via `routes` in the plugin
manifest) mount under `/api/plugins/<plugin-id>/...`.

## Examples

```bash
# Capture an engagement snapshot from a cron job
curl -X POST http://localhost:3100/api/posts/po_brutalist_drop/snapshots \
  -H 'content-type: application/json' \
  -d '{"atMinutes":30,"impressions":42000,"views":40000,"likes":3100,"comments":420,"shares":1200,"saves":640,"retentionPct":58}'

# Get a live blended score
curl http://localhost:3100/api/posts/po_brutalist_drop/score | jq

# Apply the 3-second hook playbook to a draft
curl -X POST http://localhost:3100/api/playbooks/pb_3s_hook \
  -H 'content-type: application/json' \
  -d '{"postId":"po_brutalist_drop"}'
```
