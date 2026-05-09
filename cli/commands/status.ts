import { loadWorkspace } from "../../src/lib/vault.js";
import { parseArgs, vaultRoot } from "../util.js";

export async function runStatus(argv: string[]): Promise<number> {
  const { values } = parseArgs(argv, {});
  const state = await loadWorkspace(vaultRoot(values));
  const open = state.tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  ).length;
  const live = state.posts.filter((p) => p.status === "live").length;

  if (values.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          users: state.users.length,
          labels: state.labels.length,
          projects: state.projects.length,
          tasks: { total: state.tasks.length, open },
          posts: { total: state.posts.length, live },
          theme: state.theme,
          currentUser: state.currentUserId,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }
  process.stdout.write(
    [
      `users     ${state.users.length}`,
      `labels    ${state.labels.length}`,
      `projects  ${state.projects.length}`,
      `tasks     ${state.tasks.length} (${open} open)`,
      `posts     ${state.posts.length} (${live} live)`,
      `theme     ${state.theme}`,
      `you       ${state.currentUserId}`,
    ].join("\n") + "\n",
  );
  return 0;
}
