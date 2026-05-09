import { loadWorkspace, withWorkspace } from "../../src/lib/vault.js";
import { applyPlaybook, getPlaybook, PLAYBOOKS } from "../../src/lib/playbooks.js";
import { updatePost } from "../../src/lib/mutations.js";
import { parseArgs, vaultRoot, fail, row } from "../util.js";

export async function runPlaybook(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "list":
    case undefined:
      return list(rest);
    case "show":
      return show(rest);
    case "apply":
      return apply(rest);
    default:
      fail(`Unknown playbook subcommand: ${sub}.`);
  }
}

async function list(argv: string[]): Promise<number> {
  const { values } = parseArgs(argv, {});
  if (values.json) {
    process.stdout.write(`${JSON.stringify(PLAYBOOKS, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(`${row("ID", "CATEGORY", "PLATFORMS", "NAME")}\n`);
  for (const p of PLAYBOOKS) {
    process.stdout.write(
      `${row(p.id, p.category, p.platforms.join(","), p.name)}\n`,
    );
  }
  return 0;
}

async function show(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const id = positionals[0];
  if (!id) fail("Provide a playbook id.");
  const pb = getPlaybook(id);
  if (!pb) fail(`No playbook ${id}.`);
  if (values.json) {
    process.stdout.write(`${JSON.stringify(pb, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(
    [
      `${pb.name}`,
      `id          ${pb.id}`,
      `category    ${pb.category}`,
      `platforms   ${pb.platforms.join(", ")}`,
      ``,
      pb.description,
      ``,
      pb.hookHint ? `Hook    ${pb.hookHint}` : "",
      pb.captionHint ? `Caption ${pb.captionHint}` : "",
      ``,
      `Notes:`,
      ...pb.notes.map((n) => `  · ${n}`),
    ]
      .filter(Boolean)
      .join("\n") + "\n",
  );
  return 0;
}

async function apply(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const [pbId, postId] = positionals;
  if (!pbId || !postId)
    fail("Usage: doodaboo playbook apply <playbook-id> <post-id>");
  const pb = getPlaybook(pbId);
  if (!pb) fail(`No playbook ${pbId}.`);
  const result = await withWorkspace((s) => {
    const post = s.posts.find((p) => p.id === postId);
    if (!post) fail(`No post ${postId}.`);
    const { patch, changes } = applyPlaybook(post, pb);
    return {
      state: updatePost(s, post.id, {
        ...patch,
        playbookId: pb.id,
      }),
      result: changes,
    };
  }, vaultRoot(values));
  if (values.json) {
    process.stdout.write(`${JSON.stringify({ changes: result }, null, 2)}\n`);
    return 0;
  }
  for (const c of result) process.stdout.write(`· ${c}\n`);
  return 0;
}
