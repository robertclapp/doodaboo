import { promises as fs } from "node:fs";
import { migrate, saveWorkspace, VaultCorruptError } from "../../src/lib/vault.js";
import { parseArgs, vaultRoot, fail } from "../util.js";

export async function runImport(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const file = positionals[0];
  if (!file) fail("Provide a JSON file path.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf-8"));
  } catch (err) {
    fail(
      `Couldn't read ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Run through the same migrate() pipeline `loadWorkspace` uses so
  // any nested-shape backfills happen at the trust boundary instead of
  // surprising mutations later.
  let state;
  try {
    state = migrate(parsed);
  } catch (err) {
    if (err instanceof VaultCorruptError) {
      fail(err.message);
    }
    throw err;
  }
  await saveWorkspace(state, vaultRoot(values));
  process.stdout.write(
    `Imported ${state.projects.length} projects, ${state.tasks.length} tasks, ${state.posts.length} posts.\n`,
  );
  return 0;
}
