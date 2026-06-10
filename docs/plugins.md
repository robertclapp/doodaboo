# Doodaboo Plugins

Plugins extend doodaboo without forking it. They live in
`<vault>/plugins/<id>/` and the loader picks them up at every CLI
invocation and on each request the API server processes.

## Quick start

```bash
doodaboo plugin scaffold my-plugin
# scaffolded ~/.doodaboo/plugins/my-plugin/
doodaboo plugin list
doodaboo plugin run my-plugin hello
```

The scaffold drops two files:

```
plugins/my-plugin/
  plugin.json     # manifest
  index.js        # entry
```

## Manifest

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "What this plugin does",
  "version": "0.1.0",
  "entry": "index.js",
  "permissions": ["workspace.read", "workspace.write"]
}
```

`permissions` is reserved for the future sandbox; loaders honor it as
documentation today.

## Entry shape

```js
/** @type {import('@doodaboo/plugins').PluginFactory} */
export default function createPlugin(ctx) {
  return {
    manifest: { id: "my-plugin", name: "My Plugin", version: "0.1.0" },

    // Inject custom factors into the live virality score.
    scoreFactors(post, platform) {
      return [
        {
          id: "brand-mention",
          label: "Brand mention",
          hint: "Posts that name your brand keep audiences anchored.",
          raw: post.content.caption.toLowerCase().includes("doodaboo") ? 1 : 0,
          weight: 0.05,
        },
      ];
    },

    // Add CLI subcommands.
    commands: [
      {
        name: "hello",
        describe: "Print a friendly greeting.",
        async run(argv, c) {
          c.log("hello!");
          return 0;
        },
      },
    ],

    // Mount HTTP routes under /api/plugins/my-plugin/...
    routes: [
      {
        method: "GET",
        path: "/ping",
        async handler() {
          return new Response("pong");
        },
      },
    ],

    // React to lifecycle events.
    on(event, c) {
      if (event.type === "post.scored") {
        c.log(`scored ${event.post.title} → ${event.score.value.toFixed(1)}`);
      }
    },
  };
}
```

## Available hooks

| Hook                   | When it runs                                            |
| ---------------------- | ------------------------------------------------------- |
| `scoreFactors(post)`   | Every time the live score is computed.                  |
| `commands[].run()`     | When the user runs `doodaboo plugin run <id> <cmd>`.    |
| `routes[].handler()`   | On HTTP requests under `/api/plugins/<id>/<path>`.       |
| `on(event)`            | On lifecycle events (post.created/updated/scored, etc.) |

## Trust model

Plugins run with full Node access — installing a plugin is a trust
decision. Future versions will run plugins inside a `vm` context with
declared permissions enforced; until then, treat your plugins folder
the way you'd treat your shell rc files.
