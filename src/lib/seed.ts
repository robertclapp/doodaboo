import { Label, Project, Task, User } from "./types";

// Fixed epoch — using a literal timestamp keeps seed deterministic so
// server-rendered and client-rendered initial state match exactly. Without this,
// `new Date().toISOString()` would drift between server and client and
// `Math.random()` would fill in different estimates on each render, triggering
// React hydration mismatches.
const EPOCH = "2026-04-01T00:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

function offset(days: number): string {
  return new Date(Date.parse(EPOCH) + days * DAY_MS).toISOString();
}

export const seedUsers: User[] = [
  { id: "u_rob", name: "Robert Clapp", handle: "rob", color: "#ff5c1a", role: "Founder" },
  { id: "u_mina", name: "Mina Okafor", handle: "mina", color: "#3b4ae4", role: "Design Lead" },
  { id: "u_leo", name: "Leo Tanaka", handle: "leo", color: "#16a34a", role: "Engineering" },
  { id: "u_sara", name: "Sara Ibrahim", handle: "sara", color: "#6b4ee4", role: "Product" },
  { id: "u_jules", name: "Jules Moreau", handle: "jules", color: "#dc2626", role: "QA" },
];

export const seedLabels: Label[] = [
  { id: "l_bug", name: "bug", color: "#dc2626" },
  { id: "l_feature", name: "feature", color: "#3b4ae4" },
  { id: "l_design", name: "design", color: "#6b4ee4" },
  { id: "l_infra", name: "infra", color: "#525252" },
  { id: "l_perf", name: "performance", color: "#f59e0b" },
  { id: "l_docs", name: "docs", color: "#16a34a" },
];

export const seedProjects: Project[] = [
  {
    id: "p_web",
    key: "WEB",
    name: "Marketing Website",
    description: "Public site, landing pages, docs.",
    status: "in_progress",
    priority: "high",
    leadId: "u_mina",
    memberIds: ["u_rob", "u_mina", "u_leo"],
    targetDate: offset(21),
    createdAt: offset(-30),
    updatedAt: offset(-1),
    icon: "W",
    accent: "#ff5c1a",
    nextTaskNumber: 6,
  },
  {
    id: "p_app",
    key: "APP",
    name: "Core Application",
    description: "The main product surface.",
    status: "in_progress",
    priority: "urgent",
    leadId: "u_leo",
    memberIds: ["u_rob", "u_leo", "u_sara", "u_jules"],
    targetDate: offset(42),
    createdAt: offset(-60),
    updatedAt: offset(-2),
    icon: "A",
    accent: "#3b4ae4",
    nextTaskNumber: 8,
  },
  {
    id: "p_infra",
    key: "INF",
    name: "Platform & Infra",
    description: "Deploys, observability, CI/CD.",
    status: "todo",
    priority: "medium",
    leadId: "u_rob",
    memberIds: ["u_rob", "u_leo"],
    targetDate: offset(60),
    createdAt: offset(-14),
    updatedAt: offset(-3),
    icon: "I",
    accent: "#6b4ee4",
    nextTaskNumber: 4,
  },
];

export const seedTasks: Task[] = [
  mkTask("p_web", 1, "task", "Redesign pricing page hero", "in_progress", "high", "u_mina", ["l_design"], 3, 10),
  mkTask("p_web", 2, "issue", "Fix layout shift on /blog", "todo", "medium", "u_leo", ["l_bug", "l_perf"], 2, 5),
  mkTask("p_web", 3, "task", "Add testimonial carousel", "backlog", "low", undefined, ["l_feature"], 3, 18),
  mkTask("p_web", 4, "task", "Draft launch post", "in_review", "high", "u_sara", ["l_docs"], 1, 2),
  mkTask("p_web", 5, "issue", "Footer links 404", "done", "low", "u_jules", ["l_bug"], 1, -5),

  mkTask("p_app", 1, "task", "Keyboard shortcuts overlay", "in_progress", "medium", "u_leo", ["l_feature"], 2, 7),
  mkTask("p_app", 2, "issue", "Race condition on task reorder", "todo", "urgent", "u_leo", ["l_bug"], 3, 1),
  mkTask("p_app", 3, "task", "Kanban virtualized rendering", "backlog", "high", undefined, ["l_perf"], 5, 28),
  mkTask("p_app", 4, "task", "Assignee avatar stack", "done", "low", "u_mina", ["l_design"], 1, -3),
  mkTask("p_app", 5, "issue", "Command palette search ranking", "in_review", "medium", "u_sara", ["l_feature"], 2, 3),
  mkTask("p_app", 6, "task", "Inline priority editor", "todo", "medium", "u_rob", ["l_feature"], 1, 12),
  mkTask("p_app", 7, "issue", "Filter state lost on nav", "in_progress", "high", "u_jules", ["l_bug"], 2, 0),

  mkTask("p_infra", 1, "task", "CI cache for node_modules", "todo", "medium", "u_leo", ["l_infra", "l_perf"], 2, 4),
  mkTask("p_infra", 2, "task", "Error tracking: wire Sentry", "backlog", "high", "u_rob", ["l_infra"], 3, 14),
  mkTask("p_infra", 3, "issue", "Preview deploys flake", "in_progress", "urgent", "u_leo", ["l_infra", "l_bug"], 2, -1),
];

function mkTask(
  projectId: string,
  number: number,
  type: "task" | "issue",
  title: string,
  status: Task["status"],
  priority: Task["priority"],
  assigneeId: string | undefined,
  labelIds: string[],
  estimate: number,
  dueOffsetDays: number,
): Task {
  const createdAt = offset(-7);
  return {
    id: `t_${projectId}_${number}`,
    projectId,
    number,
    type,
    title,
    description: "",
    status,
    priority,
    assigneeId,
    labelIds,
    estimate,
    dueDate: offset(dueOffsetDays),
    createdAt,
    updatedAt: createdAt,
    comments: [],
    activity: [
      { id: `a_${projectId}_${number}_0`, at: createdAt, message: `Created ${type}` },
    ],
  };
}
