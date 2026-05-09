# Doodaboo CLI

`doodaboo` is the headless interface to the same workspace your web and
desktop UIs use. Every command operates on a vault — a directory on disk
containing `workspace.json`, rolling backups, plugins, and exports.
Concurrent CLI and web edits stay consistent because both go through the
same `withWorkspace(load → mutate → save)` primitive.

## Install

```bash
npm install
npm link            # makes `doodaboo` available globally
```

Or, without linking:

```bash
npm run cli -- <command>
```

## Vault

By default the vault lives at `~/.doodaboo`. Override per-command with
`--vault <path>` or globally with `DOODABOO_VAULT=/path npm run cli ...`.

```bash
doodaboo init                    # creates ~/.doodaboo
doodaboo init /tmp/team-vault    # creates that directory
doodaboo status                  # workspace summary
```

Vault layout:

```
<vault>/
  workspace.json         # canonical state
  backups/
    workspace-<iso>.json # rolling, last 20 retained
  plugins/               # user plugins
  exports/               # JSON + markdown exports
```

Saves are atomic (`tmp → rename`) and write a backup snapshot on every
successful save. Recover by copying any backup back to `workspace.json`.

## Reference

```text
doodaboo init [path] [--force]
doodaboo status [--json]

doodaboo project list [--json]
doodaboo project new --key=KEY --name="…" [--description=…] [--accent=#hex]
doodaboo project show <id|KEY>
doodaboo project set <id|KEY> [--status=…] [--priority=…] [--name=…]

doodaboo task list [--project=KEY] [--status=…] [--assignee=…] [--json]
doodaboo task new --project=KEY --title="…" [--type=task|issue]
                  [--priority=…] [--status=…] [--assignee=…]
doodaboo task show <id|KEY-N>
doodaboo task set  <id|KEY-N> [--status=…] [--priority=…] [--assignee=…]
doodaboo task rm   <id|KEY-N>

doodaboo post list [--platform=…] [--status=…] [--json]
doodaboo post new --platform=… --title="…"
                  [--format=video|image|carousel|text|live]
                  [--hook="…"] [--caption="…"] [--duration=21]
doodaboo post show <id>
doodaboo post score <id>             # explained factor breakdown
doodaboo post recommend <id>         # actionable next-edit suggestions
doodaboo post snap  <id> --at=15 --views=12000 --likes=900 --shares=120 \
                                     --saves=60 --retention=55
doodaboo post variant <id>           # duplicate as A/B variant
doodaboo post set <id> [--title=…] [--status=…] [--hook=…] [--caption=…]

doodaboo playbook list
doodaboo playbook show <id>
doodaboo playbook apply <playbook-id> <post-id>

doodaboo hook generate "subject" [--platform=tiktok] [--audience=founders]
                                 [--family=hook|contrarian|...]

doodaboo export [path] [--markdown]  # JSON or markdown vault
doodaboo import <path> [--force]

doodaboo plugin list
doodaboo plugin scaffold <name>      # create plugins/<name>/{plugin.json, index.js}
doodaboo plugin run <id> <command>
doodaboo plugin path                 # prints the plugins/ directory

doodaboo serve [--port=3100] [--host=127.0.0.1] [--dev]
```

## `--json` everywhere

Every command that prints data accepts `--json` so you can pipe into
`jq`, ship into Slack via a webhook, etc.

```bash
doodaboo task list --status=in_progress --json | jq '.[].title'
doodaboo post score po_brutalist_drop --json | jq '.factors[] | {label, contribution}'
```

## `serve`

`doodaboo serve` boots the Next.js production server with
`DOODABOO_VAULT` pre-set, so the web UI and the API routes operate on
the same vault the CLI just edited. Run it on `127.0.0.1` for personal
use, or behind a reverse proxy on a private network for shared access.

```bash
doodaboo serve --port=3100
# http://127.0.0.1:3100
```
