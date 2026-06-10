#!/usr/bin/env node
/**
 * doodaboo — CLI entry point.
 *
 * Run via `npm run cli -- <command>` or after `npm link`, just `doodaboo
 * <command>`. Routes the first positional arg to a subcommand module.
 */
import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import { runProject } from "./commands/project.js";
import { runTask } from "./commands/task.js";
import { runPost } from "./commands/post.js";
import { runPlaybook } from "./commands/playbook.js";
import { runHook } from "./commands/hook.js";
import { runExport } from "./commands/export.js";
import { runImport } from "./commands/import.js";
import { runServe } from "./commands/serve.js";
import { runPlugin } from "./commands/plugin.js";

const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  init: runInit,
  status: runStatus,
  project: runProject,
  task: runTask,
  post: runPost,
  playbook: runPlaybook,
  hook: runHook,
  export: runExport,
  import: runImport,
  serve: runServe,
  plugin: runPlugin,
};

const HELP = `doodaboo — brutalist project OS, headless edition

Usage:
  doodaboo <command> [options]

Commands:
  init [path]                  Create a new vault (default ~/.doodaboo).
  status                       Print a workspace summary.
  project <list|new|show>      Manage projects.
  task <list|new|set|show>     Manage tasks.
  post <list|new|score|snap>   Manage posts and engagement snapshots.
  playbook <list|show|apply>   Apply growth playbooks to posts.
  hook generate <subject>      Generate hook variants for a subject.
  export [path]                Write a JSON snapshot of the vault.
  import <path>                Replace the vault from a JSON snapshot.
  serve [--port=3100]          Start the local API + web app on a port.
  plugin <list|enable|run>     Manage plugins under <vault>/plugins.

Global options:
  --vault <path>               Override the vault root (default ~/.doodaboo
                               or $DOODABOO_VAULT).
  --json                       Machine-readable output for scripts.
  --help                       Show command help.
`;

async function main(): Promise<number> {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "--help" || command === "help" || command === "-h") {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    const pkg = await import("../package.json", { with: { type: "json" } });
    process.stdout.write(`doodaboo ${(pkg as { default: { version: string } }).default.version}\n`);
    return 0;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  }
  return handler(rest);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    if (process.env.DOODABOO_DEBUG) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
    process.exit(1);
  },
);
