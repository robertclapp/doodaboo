import type { Platform, Post, ScoreFactor } from "../types";

/**
 * Plugin contract.
 *
 * A plugin is a folder under `<vault>/plugins/<name>/` containing a
 * `plugin.json` manifest and an entry JS file. Plugins can:
 *
 *  - register additional scoring factors via `scoreFactors`,
 *  - register custom playbooks via `playbooks` (typed alongside the
 *    built-ins in `lib/playbooks.ts`),
 *  - register CLI subcommands via `commands`,
 *  - register HTTP route handlers via `routes`,
 *  - subscribe to lifecycle events via `on`.
 *
 * Plugins run with full Node access — installing one is a trust
 * decision. The loader sandboxes nothing; it just provides a stable
 * surface so plugin code stays portable across desktop, server, and
 * CLI host modes.
 */

export interface PluginManifest {
  /** Stable identifier; defaults to the directory name. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Optional one-line description. */
  description?: string;
  /** Semver-style version string. */
  version: string;
  /** Optional list of permissions for the future sandbox. */
  permissions?: ("workspace.read" | "workspace.write" | "network")[];
  /** Path to the entry file relative to the plugin folder. Default `index.js`. */
  entry?: string;
}

export interface PluginContext {
  vaultRoot: string;
  log: (msg: string) => void;
}

export interface PluginScoreContribution {
  id: string;
  label: string;
  hint: string;
  /** Quality 0..1. */
  raw: number;
  /** Weight in the final blended live score, 0..1 (max ~0.15 recommended). */
  weight: number;
}

export interface PluginCommand {
  name: string;
  describe: string;
  run: (argv: string[], ctx: PluginContext) => Promise<number>;
}

export interface PluginRoute {
  /** GET, POST, PUT, DELETE… */
  method: string;
  /** Path served under `/api/plugins/<plugin-id>`. */
  path: string;
  handler: (req: Request, ctx: PluginContext) => Promise<Response>;
}

export type PluginEvent =
  | { type: "post.created"; post: Post }
  | { type: "post.updated"; post: Post }
  | { type: "post.scored"; post: Post; score: { value: number } }
  | { type: "task.created"; taskId: string }
  | { type: "snapshot.added"; postId: string };

export interface Plugin {
  manifest: PluginManifest;

  scoreFactors?: (
    post: Post,
    platform: Platform,
  ) => PluginScoreContribution[] | Promise<PluginScoreContribution[]>;

  commands?: PluginCommand[];

  routes?: PluginRoute[];

  on?: (event: PluginEvent, ctx: PluginContext) => void | Promise<void>;
}

export type PluginFactory = (ctx: PluginContext) => Plugin | Promise<Plugin>;

/**
 * Convert a plugin contribution into a ScoreFactor row that the existing
 * UI can render unchanged.
 */
export function pluginContributionToFactor(
  c: PluginScoreContribution,
): ScoreFactor {
  return {
    id: `plugin:${c.id}`,
    label: c.label,
    group: "diffusion",
    raw: Math.max(0, Math.min(1, c.raw)),
    weight: Math.max(0, Math.min(0.5, c.weight)),
    contribution:
      Math.max(0, Math.min(1, c.raw)) *
      Math.max(0, Math.min(0.5, c.weight)) *
      100,
    hint: c.hint,
  };
}
