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
 * the real codegen writes for a root project without child components, in
 * the default "js/dts" layout: api.js, api.d.ts, server.js, server.d.ts,
 * dataModel.d.ts — including the (empty) `components` export.
 *
 * Running `npx convex dev` later overwrites the directory with the canonical
 * output; the file names are identical so nothing is left stale.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const convexDir = path.join(root, "convex");
const outDir = path.join(convexDir, "_generated");
// The templates are not in the package's `exports` map, so import them by
// file path rather than by specifier.
const templates = (name) =>
  import(
    pathToFileURL(
      path.join(root, "node_modules", "convex", "dist", "esm", "cli", "codegen_templates", `${name}.js`),
    ).href
  );

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

const [{ importPath, moduleIdentifier }, { apiComment, compareModulePaths, header }, { serverCodegen }] =
  await Promise.all([templates("api"), templates("common"), templates("server")]);

// dynamicDataModelDTS() from codegen_templates/dataModel.js, inlined for the
// same reason (that module imports the CLI's config loader). With a reachable
// deployment the CLI writes the *static* form instead — every table spelled
// out from the analysis — which is type-equivalent to this one; the owner's
// first `npx convex dev` rewrites the file in that form.
function dataModelDTS() {
  return `
  ${header("Generated data model types.")}
  import type { DataModelFromSchemaDefinition, DocumentByName, TableNamesInDataModel, SystemTableNames } from "convex/server";
  import type { GenericId } from "convex/values";
  import schema from "../schema.js";

  /**
   * The names of all of your Convex tables.
   */
  export type TableNames = TableNamesInDataModel<DataModel>;

  /**
   * The type of a document stored in Convex.
   *
   * @typeParam TableName - A string literal type of the table name (like "users").
   */
  export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;

  /**
   * An identifier for a document in Convex.
   *
   * Convex documents are uniquely identified by their \`Id\`, which is accessible
   * on the \`_id\` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
   *
   * Documents can be loaded using \`db.get(tableName, id)\` in query and mutation functions.
   *
   * IDs are just strings at runtime, but this type can be used to distinguish them from other
   * strings when type checking.
   *
   * @typeParam TableName - A string literal type of the table name (like "users").
   */
  export type Id<TableName extends TableNames | SystemTableNames> = GenericId<TableName>;

  /**
   * A type describing your Convex data model.
   *
   * This type includes information about what tables you have, the type of
   * documents stored in those tables, and the indexes defined on them.
   *
   * This type is used to parameterize methods like \`queryGeneric\` and
   * \`mutationGeneric\` to make them type-safe.
   */
  export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
  `;
}

// componentApiJs() from codegen_templates/component_api.js, inlined: that
// module imports the bundler, whose dependencies are not installed here.
function apiJS() {
  return [
    header("Generated `api` utility."),
    `
    import { anyApi, componentsGeneric } from "convex/server";

    ${apiComment("api", undefined)}
    export const api = anyApi;
    export const internal = anyApi;
    export const components = componentsGeneric();
  `,
  ].join("\n");
}

// api.d.ts exactly as componentApiDTS() writes it for a root project with no
// child components: the dynamic api objects, then an empty `components`.
function apiDTS(modulePaths) {
  const sorted = [...modulePaths].sort(compareModulePaths);
  const lines = [header("Generated `api` utility.")];
  for (const modulePath of sorted) {
    lines.push(`import type * as ${moduleIdentifier(modulePath)} from "../${importPath(modulePath)}.js";`);
  }
  lines.push(`
    import type {
      ApiFromModules,
      FilterApi,
      FunctionReference,
    } from "convex/server";

    declare const fullApi: ApiFromModules<{
  `);
  for (const modulePath of sorted) {
    lines.push(`  "${importPath(modulePath)}": typeof ${moduleIdentifier(modulePath)},`);
  }
  lines.push(`}>;`);
  lines.push(`
    ${apiComment("api", "public")}
    export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
    ${apiComment("internal", "internal")}
    export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
  `);
  lines.push(`
  export declare const components: {`);
  lines.push("};");
  return lines.join("\n");
}

const server = serverCodegen({ useTypeScript: false, envVars: undefined });
const files = {
  "api.js": apiJS(),
  "api.d.ts": apiDTS(modules),
  "server.js": server.JS,
  "server.d.ts": server.DTS,
  "dataModel.d.ts": dataModelDTS(),
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
