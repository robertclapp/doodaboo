import { loadWorkspace, withWorkspace } from "../../src/lib/vault.js";
import { createProject, updateProject } from "../../src/lib/mutations.js";
import { parseArgs, vaultRoot, fail, row } from "../util.js";
import { Priority, Status } from "../../src/lib/types.js";

export async function runProject(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "list":
    case undefined:
      return list(rest);
    case "new":
      return create(rest);
    case "show":
      return show(rest);
    case "set":
      return set(rest);
    default:
      fail(`Unknown project subcommand: ${sub}. Try list, new, show, set.`);
  }
}

async function list(argv: string[]): Promise<number> {
  const { values } = parseArgs(argv, {});
  const state = await loadWorkspace(vaultRoot(values));
  if (values.json) {
    process.stdout.write(`${JSON.stringify(state.projects, null, 2)}\n`);
    return 0;
  }
  if (state.projects.length === 0) {
    process.stdout.write("No projects.\n");
    return 0;
  }
  process.stdout.write(`${row("KEY", "NAME", "STATUS", "TASKS")}\n`);
  for (const p of state.projects) {
    const tasks = state.tasks.filter((t) => t.projectId === p.id).length;
    process.stdout.write(`${row(p.key, p.name, p.status, tasks)}\n`);
  }
  return 0;
}

async function create(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs<{
    key?: string;
    name?: string;
    description?: string;
    accent?: string;
  }>(argv, {
    key: { type: "string", short: "k" },
    name: { type: "string", short: "n" },
    description: { type: "string", short: "d" },
    accent: { type: "string" },
  });
  const name = values.name ?? positionals[0];
  if (!name) fail("Provide a name: doodaboo project new --name=\"…\"");
  const key = values.key ?? slug(name);
  const project = await withWorkspace((s) => {
    if (s.projects.some((p) => p.key.toUpperCase() === key.toUpperCase())) {
      fail(`Project key ${key} already exists.`);
    }
    const r = createProject(s, {
      key: key.toUpperCase(),
      name,
      description: values.description,
      accent: values.accent,
    });
    return { state: r.state, result: r.project };
  }, vaultRoot(values));
  if (values.json) {
    process.stdout.write(`${JSON.stringify(project, null, 2)}\n`);
  } else {
    process.stdout.write(`Created ${project.key} ${project.name} (${project.id})\n`);
  }
  return 0;
}

async function show(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const ident = positionals[0];
  if (!ident) fail("Provide a project id or key.");
  const state = await loadWorkspace(vaultRoot(values));
  const project = state.projects.find(
    (p) => p.id === ident || p.key.toUpperCase() === ident.toUpperCase(),
  );
  if (!project) fail(`No project ${ident}.`);
  const tasks = state.tasks.filter((t) => t.projectId === project.id);
  if (values.json) {
    process.stdout.write(
      `${JSON.stringify({ project, tasks }, null, 2)}\n`,
    );
    return 0;
  }
  process.stdout.write(
    [
      `${project.key} · ${project.name}`,
      `id          ${project.id}`,
      `status      ${project.status}`,
      `priority    ${project.priority}`,
      `members     ${project.memberIds.join(", ")}`,
      `targetDate  ${project.targetDate ?? "—"}`,
      `next #      ${project.nextTaskNumber}`,
      `tasks       ${tasks.length}`,
      project.description ? `\n${project.description}` : "",
    ].join("\n") + "\n",
  );
  return 0;
}

async function set(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs<{
    status?: string;
    priority?: string;
    name?: string;
  }>(argv, {
    status: { type: "string" },
    priority: { type: "string" },
    name: { type: "string" },
  });
  const ident = positionals[0];
  if (!ident) fail("Provide a project id or key.");
  await withWorkspace((s) => {
    const project = s.projects.find(
      (p) => p.id === ident || p.key.toUpperCase() === ident.toUpperCase(),
    );
    if (!project) fail(`No project ${ident}.`);
    return {
      state: updateProject(s, project.id, {
        status: values.status as Status | undefined,
        priority: values.priority as Priority | undefined,
        name: values.name,
      }),
      result: undefined,
    };
  }, vaultRoot(values));
  process.stdout.write("Updated.\n");
  return 0;
}

function slug(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4) || "PRJ";
}
