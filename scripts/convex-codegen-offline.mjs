#!/usr/bin/env node
/**
 * convex:codegen:offline — write convex/_generated/ without a deployment.
 *
 * `npx convex codegen` (and `npx convex dev`) generate these files, but both
 * refuse to run unless a Convex deployment is configured and reachable —
 * they ask the deployment to analyze the functions. That makes a fresh clone
 * without Convex credentials unable to typecheck, because src/ imports
 * convex/_generated/api.
 *
 * This script produces the same files from the CLI's own template functions
 * (node_modules/convex/dist/esm/cli/codegen_templates), so the output is what
 * the real codegen writes for a root project without components, in the
 * default "js/dts" layout: api.js, api.d.ts, server.js, server.d.ts,
 * dataModel.d.ts. The only difference is that the real api.d.ts also exports
 * a `components` object (empty for this project) — nothing here imports it.
 *
 * Running `npx convex dev` later overwrites the directory with the canonical
 * output; the file names are identical so nothing is left stale.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const convexDir = path.join(root, "convex");
const outDir = path.join(convexDir, "_generated");
const require = createRequire(import.meta.url);
const templates = (name) =>
  import(require.resolve(`convex/dist/esm/cli/codegen_templates/${name}.js`));

/**
 * Function modules: every file under convex/ that the bundler treats as an
 * entry point. Mirrors node_modules/convex/dist/esm/bundler/index.js: JS/TS
 * extensions only; skip _generated/, dotfiles, emacs tempfiles, schema.ts,
 * anything with more than one dot in its name (which is what excludes
 * auth.config.ts, *.test.ts and *.d.ts), and paths containing a space.
 */
function functionModules(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(abs).isDirectory()) {
      if (name === "_generated" || name === "node_modules") continue;
      out.push(...functionModules(abs, rel));
      continue;
    }
    if (!/\.(ts|js|tsx|jsx|mts|mjs|cjs)$/.test(name)) continue;
    if (name.startsWith(".") || name.startsWith("#")) continue;
    if (/^schema\.(ts|js)$/.test(rel)) continue;
    if ((name.match(/\./g) ?? []).length > 1) continue;
    if (rel.includes(" ")) continue;
    out.push(rel);
  }
  return out;
}

const modules = functionModules(convexDir);
if (modules.length === 0) {
  process.stderr.write("[convex:codegen] no function modules found under convex/\n");
  process.exit(1);
}

const [{ apiCodegen }, { serverCodegen }, { dynamicDataModelDTS }] = await Promise.all([
  templates("api"),
  templates("server"),
  templates("dataModel"),
]);

const api = apiCodegen(modules, { useTypeScript: false });
const server = serverCodegen({ useTypeScript: false, envVars: undefined });
const files = {
  "api.js": api.JS,
  "api.d.ts": api.DTS,
  "server.js": server.JS,
  "server.d.ts": server.DTS,
  "dataModel.d.ts": dynamicDataModelDTS(),
};

let prettier = null;
try {
  prettier = await import("prettier");
} catch {
  // Formatting is cosmetic; the real codegen formats with prettier too.
}

mkdirSync(outDir, { recursive: true });
for (const [name, source] of Object.entries(files)) {
  const target = path.join(outDir, name);
  let text = source;
  if (prettier) text = await prettier.format(text, { parser: "typescript" });
  writeFileSync(target, text);
}
process.stdout.write(
  `[convex:codegen] wrote ${Object.keys(files).length} files to convex/_generated for ${modules.length} module(s): ${modules.join(", ")}\n`,
);
