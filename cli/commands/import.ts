import { promises as fs } from "node:fs";
import { saveWorkspace } from "../../src/lib/vault.js";
import { WorkspaceState, WORKSPACE_VERSION } from "../../src/lib/mutations.js";
import { parseArgs, vaultRoot, fail } from "../util.js";

export async function runImport(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs<{ force?: boolean }>(argv, {
    force: { type: "boolean" },
  });
  const file = positionals[0];
  if (!file) fail("Provide a JSON file path.");
  const raw = await fs.readFile(file, "utf-8");
  const parsed = JSON.parse(raw) as Partial<WorkspaceState> & {
    version?: number;
  };

  if (parsed.version !== undefined && parsed.version !== WORKSPACE_VERSION) {
    if (!values.force) {
      fail(
        `Import file is version ${parsed.version}, this build is ${WORKSPACE_VERSION}. Pass --force to import anyway (it will be migrated on next load).`,
      );
    }
  }

  const state: WorkspaceState = {
    version: WORKSPACE_VERSION,
    theme: parsed.theme ?? "system",
    currentUserId: parsed.currentUserId ?? "u_unknown",
    users: parsed.users ?? [],
    labels: parsed.labels ?? [],
    projects: parsed.projects ?? [],
    tasks: parsed.tasks ?? [],
    posts: parsed.posts ?? [],
  };
  await saveWorkspace(state, vaultRoot(values));
  process.stdout.write(
    `Imported ${state.projects.length} projects, ${state.tasks.length} tasks, ${state.posts.length} posts.\n`,
  );
  return 0;
}
