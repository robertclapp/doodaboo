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

Auth is intentionally absent — bind to `127.0.0.1` for personal use, or
put a reverse proxy with auth in front for shared network exposure.

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
