import { promises as fs } from "node:fs";
import path from "node:path";
import { vaultPaths } from "../../src/lib/vault.js";
import { inventory, loadPlugins } from "../../src/lib/plugins/loader.js";
import { parseArgs, vaultRoot, fail, row } from "../util.js";

export async function runPlugin(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "list":
    case undefined:
      return list(rest);
    case "scaffold":
      return scaffold(rest);
    case "run":
      return run(rest);
    case "path":
      return showPath(rest);
    default:
      fail(`Unknown plugin subcommand: ${sub}.`);
  }
}

async function list(argv: string[]): Promise<number> {
  const { values } = parseArgs(argv, {});
  const items = await inventory(vaultRoot(values));
  if (values.json) {
    process.stdout.write(`${JSON.stringify(items, null, 2)}\n`);
    return 0;
  }
  if (items.length === 0) {
    process.stdout.write(
      "No plugins. Run `doodaboo plugin scaffold <name>` to create one.\n",
    );
    return 0;
  }
  process.stdout.write(`${row("ID", "VERSION", "HOOKS", "NAME")}\n`);
  for (const p of items) {
    const hooks = [
      p.hooks.scoreFactors && "scoring",
      p.hooks.commands ? `cmds:${p.hooks.commands}` : "",
      p.hooks.routes ? `routes:${p.hooks.routes}` : "",
      p.hooks.events && "events",
    ]
      .filter(Boolean)
      .join(",");
    process.stdout.write(`${row(p.id, p.version, hooks, p.name)}\n`);
  }
  return 0;
}

async function scaffold(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const name = positionals[0];
  if (!name) fail("Provide a name: doodaboo plugin scaffold my-plugin");
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const root = vaultRoot(values);
  const dir = path.join(vaultPaths(root).pluginsDir, slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "plugin.json"),
    `${JSON.stringify(
      {
        id: slug,
        name,
        description: "A doodaboo plugin",
        version: "0.1.0",
        entry: "index.js",
        permissions: ["workspace.read"],
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  await fs.writeFile(path.join(dir, "index.js"), STARTER_PLUGIN, "utf-8");
  process.stdout.write(`Scaffolded ${dir}\n`);
  return 0;
}

async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const [pluginId, command, ...rest] = positionals;
  if (!pluginId || !command) {
    fail("Usage: doodaboo plugin run <plugin-id> <command> [args]");
  }
  const plugins = await loadPlugins(vaultRoot(values));
  const entry = plugins.find((p) => p.plugin.manifest.id === pluginId);
  if (!entry) fail(`No plugin ${pluginId}.`);
  const cmd = entry.plugin.commands?.find((c) => c.name === command);
  if (!cmd) fail(`Plugin ${pluginId} doesn't expose command ${command}.`);
  return cmd.run(rest, entry.ctx);
}

async function showPath(argv: string[]): Promise<number> {
  const { values } = parseArgs(argv, {});
  process.stdout.write(`${vaultPaths(vaultRoot(values)).pluginsDir}\n`);
  return 0;
}

const STARTER_PLUGIN = `// Doodaboo plugin scaffold.
// Run \`doodaboo plugin list\` to see this plugin's hooks.
// Run \`doodaboo plugin run <id> hello\` to invoke the example command.

/** @type {import('../../../src/lib/plugins/types').PluginFactory} */
export default function createPlugin(ctx) {
  return {
    manifest: {
      id: "starter",
      name: "Starter Plugin",
      version: "0.1.0",
    },
    commands: [
      {
        name: "hello",
        describe: "Print a friendly greeting.",
        async run(argv, c) {
          c.log("hello from a plugin!");
          return 0;
        },
      },
    ],
    scoreFactors(post) {
      // Toy factor: reward posts that mention the user's brand keyword.
      const brand = process.env.DOODABOO_BRAND || "doodaboo";
      const haystack =
        post.content.hook + " " + post.content.caption + " " + post.title;
      const mentions = haystack.toLowerCase().includes(brand.toLowerCase());
      return [
        {
          id: "brand-mention",
          label: "Brand mention",
          hint:
            "Posts that include your brand keyword anchor the audience to the source.",
          raw: mentions ? 1 : 0,
          weight: 0.05,
        },
      ];
    },
    on(event, c) {
      if (event.type === "post.scored") {
        c.log(\`scored \${event.post.title} = \${event.score.value.toFixed(1)}\`);
      }
    },
  };
}
`;
