import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { vaultPaths } from "../vault";
import type {
  Plugin,
  PluginContext,
  PluginEvent,
  PluginFactory,
  PluginManifest,
} from "./types";

const MANIFEST = "plugin.json";

/** Discover and load every plugin folder under `<vault>/plugins/`. */
export async function loadPlugins(
  root?: string,
): Promise<{ plugin: Plugin; ctx: PluginContext }[]> {
  const paths = vaultPaths(root);
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(paths.pluginsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const plugins: { plugin: Plugin; ctx: PluginContext }[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const dir = path.join(paths.pluginsDir, dirent.name);
    try {
      const loaded = await loadOne(dir);
      plugins.push(loaded);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[doodaboo] plugin ${dirent.name} failed to load: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return plugins;
}

async function loadOne(
  dir: string,
): Promise<{ plugin: Plugin; ctx: PluginContext }> {
  const manifestPath = path.join(dir, MANIFEST);
  const raw = await fs.readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(raw) as PluginManifest;
  if (!manifest.id) manifest.id = path.basename(dir);
  if (!manifest.name) manifest.name = manifest.id;
  if (!manifest.version) manifest.version = "0.0.0";

  const entry = path.resolve(dir, manifest.entry ?? "index.js");
  // The dynamic import target is data-driven: plugin entry points come
  // from disk at runtime, not from the source tree. Webpack would warn
  // about the dynamic specifier; we tell it to leave the import alone.
  const mod = (await import(/* webpackIgnore: true */ pathToFileURL(entry).href)) as {
    default?: PluginFactory | Plugin;
  };
  const factoryOrPlugin = mod.default;
  if (!factoryOrPlugin) {
    throw new Error(`${entry}: default export is required`);
  }

  const ctx: PluginContext = {
    vaultRoot: path.resolve(dir, "..", ".."),
    log: (msg) => {
      // eslint-disable-next-line no-console
      console.log(`[plugin:${manifest.id}] ${msg}`);
    },
  };
  const plugin: Plugin =
    typeof factoryOrPlugin === "function"
      ? await (factoryOrPlugin as PluginFactory)(ctx)
      : (factoryOrPlugin as Plugin);
  if (!plugin.manifest) plugin.manifest = manifest;

  return { plugin, ctx };
}

/** Fan an event out to every plugin's `on` hook. Errors are isolated. */
export async function emit(
  plugins: { plugin: Plugin; ctx: PluginContext }[],
  event: PluginEvent,
): Promise<void> {
  await Promise.all(
    plugins.map(async ({ plugin, ctx }) => {
      if (!plugin.on) return;
      try {
        await plugin.on(event, ctx);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[doodaboo] plugin ${plugin.manifest.id} threw on ${event.type}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }),
  );
}

export interface PluginInventoryEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  hooks: {
    scoreFactors: boolean;
    commands: number;
    routes: number;
    events: boolean;
  };
}

export async function inventory(
  root?: string,
): Promise<PluginInventoryEntry[]> {
  const loaded = await loadPlugins(root);
  return loaded.map(({ plugin }) => ({
    id: plugin.manifest.id,
    name: plugin.manifest.name,
    version: plugin.manifest.version,
    description: plugin.manifest.description,
    hooks: {
      scoreFactors: typeof plugin.scoreFactors === "function",
      commands: plugin.commands?.length ?? 0,
      routes: plugin.routes?.length ?? 0,
      events: typeof plugin.on === "function",
    },
  }));
}
