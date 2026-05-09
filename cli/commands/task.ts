import { loadWorkspace, withWorkspace } from "../../src/lib/vault.js";
import { createTask, updateTask, deleteTask } from "../../src/lib/mutations.js";
import { parseArgs, vaultRoot, fail, row } from "../util.js";
import { Priority, Status, Task, TaskType } from "../../src/lib/types.js";
import type { WorkspaceState } from "../../src/lib/mutations.js";

export async function runTask(argv: string[]): Promise<number> {
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
      return setFields(rest);
    case "rm":
    case "delete":
      return remove(rest);
    default:
      fail(
        `Unknown task subcommand: ${sub}. Try list, new, show, set, rm.`,
      );
  }
}

async function list(argv: string[]): Promise<number> {
  const { values } = parseArgs<{
    project?: string;
    status?: string;
    assignee?: string;
  }>(argv, {
    project: { type: "string", short: "p" },
    status: { type: "string", short: "s" },
    assignee: { type: "string", short: "a" },
  });
  const state = await loadWorkspace(vaultRoot(values));
  const proj = values.project
    ? state.projects.find(
        (p) =>
          p.id === values.project ||
          p.key.toUpperCase() === values.project!.toUpperCase(),
      )
    : undefined;
  const tasks = state.tasks
    .filter((t) => !proj || t.projectId === proj.id)
    .filter((t) => !values.status || t.status === values.status)
    .filter((t) => !values.assignee || t.assigneeId === values.assignee);

  if (values.json) {
    process.stdout.write(`${JSON.stringify(tasks, null, 2)}\n`);
    return 0;
  }
  if (tasks.length === 0) {
    process.stdout.write("No tasks.\n");
    return 0;
  }
  process.stdout.write(
    `${row("ID", "STATUS", "PRIORITY", "TITLE")}\n`,
  );
  for (const t of tasks) {
    const proj = state.projects.find((p) => p.id === t.projectId);
    process.stdout.write(
      `${row(`${proj?.key}-${t.number}`, t.status, t.priority, t.title)}\n`,
    );
  }
  return 0;
}

async function create(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs<{
    project?: string;
    title?: string;
    type?: string;
    priority?: string;
    status?: string;
    assignee?: string;
  }>(argv, {
    project: { type: "string", short: "p" },
    title: { type: "string", short: "t" },
    type: { type: "string" },
    priority: { type: "string" },
    status: { type: "string" },
    assignee: { type: "string", short: "a" },
  });
  const title = values.title ?? positionals[0];
  if (!title) fail("Provide a title.");
  if (!values.project)
    fail("Provide --project=KEY.");

  const task = await withWorkspace((s) => {
    const proj = resolveProject(s, values.project!);
    const r = createTask(s, {
      projectId: proj.id,
      title,
      type: (values.type ?? "task") as TaskType,
      priority: values.priority as Priority | undefined,
      status: values.status as Status | undefined,
      assigneeId: values.assignee,
    });
    return { state: r.state, result: r.task };
  }, vaultRoot(values));
  if (values.json) {
    process.stdout.write(`${JSON.stringify(task, null, 2)}\n`);
  } else {
    const proj = (await loadWorkspace(vaultRoot(values))).projects.find(
      (p) => p.id === task.projectId,
    );
    process.stdout.write(`Created ${proj?.key}-${task.number} ${task.title}\n`);
  }
  return 0;
}

async function show(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const ident = positionals[0];
  if (!ident) fail("Provide a task id or KEY-N.");
  const state = await loadWorkspace(vaultRoot(values));
  const task = resolveTask(state, ident);
  const proj = state.projects.find((p) => p.id === task.projectId);
  if (values.json) {
    process.stdout.write(`${JSON.stringify({ project: proj, task }, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(
    [
      `${proj?.key}-${task.number} · ${task.title}`,
      `id         ${task.id}`,
      `type       ${task.type}`,
      `status     ${task.status}`,
      `priority   ${task.priority}`,
      `assignee   ${task.assigneeId ?? "—"}`,
      `labels     ${task.labelIds.join(", ") || "—"}`,
      `dueDate    ${task.dueDate ?? "—"}`,
      `estimate   ${task.estimate ?? "—"}`,
      task.description ? `\n${task.description}` : "",
    ].join("\n") + "\n",
  );
  return 0;
}

async function setFields(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs<{
    status?: string;
    priority?: string;
    assignee?: string;
    title?: string;
  }>(argv, {
    status: { type: "string" },
    priority: { type: "string" },
    assignee: { type: "string" },
    title: { type: "string" },
  });
  const ident = positionals[0];
  if (!ident) fail("Provide a task id or KEY-N.");
  await withWorkspace((s) => {
    const task = resolveTask(s, ident);
    return {
      state: updateTask(s, task.id, {
        status: values.status as Status | undefined,
        priority: values.priority as Priority | undefined,
        assigneeId: values.assignee,
        title: values.title,
      }),
      result: undefined,
    };
  }, vaultRoot(values));
  process.stdout.write("Updated.\n");
  return 0;
}

async function remove(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const ident = positionals[0];
  if (!ident) fail("Provide a task id or KEY-N.");
  await withWorkspace((s) => {
    const task = resolveTask(s, ident);
    return { state: deleteTask(s, task.id), result: undefined };
  }, vaultRoot(values));
  process.stdout.write("Deleted.\n");
  return 0;
}

function resolveProject(state: WorkspaceState, key: string) {
  const proj = state.projects.find(
    (p) => p.id === key || p.key.toUpperCase() === key.toUpperCase(),
  );
  if (!proj) fail(`No project ${key}.`);
  return proj;
}

function resolveTask(state: WorkspaceState, ident: string): Task {
  const byId = state.tasks.find((t) => t.id === ident);
  if (byId) return byId;
  const m = ident.match(/^([A-Z0-9]+)-(\d+)$/i);
  if (m) {
    const [, key, num] = m;
    const proj = state.projects.find(
      (p) => p.key.toUpperCase() === key.toUpperCase(),
    );
    const task = proj
      ? state.tasks.find(
          (t) => t.projectId === proj.id && t.number === Number(num),
        )
      : undefined;
    if (task) return task;
  }
  fail(`No task ${ident}.`);
}
