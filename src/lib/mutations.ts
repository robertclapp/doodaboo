import { nanoid } from "nanoid";
import {
  ActivityEntry,
  Comment,
  EngagementSnapshot,
  Label,
  Post,
  Project,
  Status,
  Task,
  User,
} from "./types";
import {
  seedLabels,
  seedPosts,
  seedProjects,
  seedTasks,
  seedUsers,
} from "./seed";

/**
 * Pure mutation layer.
 *
 * Every state change in the app — issue creation, post duplication,
 * snapshot capture, theme flip — is a pure function `(state, args) =>
 * { state: nextState, ... }`. The browser zustand store, the CLI, and
 * the HTTP API route handlers all delegate to these functions, so
 * mutation rules live in exactly one place and behavior is identical
 * across every entry point.
 *
 * No I/O here, no IDs from outside (we generate via `nanoid`), no
 * date.now imports — everything is deterministic given its inputs.
 */

export type Theme = "light" | "dark" | "system";

export interface WorkspaceState {
  version: 1;
  theme: Theme;
  currentUserId: string;
  users: User[];
  labels: Label[];
  projects: Project[];
  tasks: Task[];
  posts: Post[];
}

export const WORKSPACE_VERSION = 1 as const;

export function emptyWorkspace(): WorkspaceState {
  return {
    version: WORKSPACE_VERSION,
    theme: "system",
    currentUserId: seedUsers[0].id,
    users: seedUsers,
    labels: seedLabels,
    projects: seedProjects,
    tasks: seedTasks,
    posts: seedPosts,
  };
}

const nowIso = () => new Date().toISOString();

// ── Users ───────────────────────────────────────────────────────────────────

export function addUser(
  state: WorkspaceState,
  data: Omit<User, "id">,
): { state: WorkspaceState; user: User } {
  const user: User = { id: `u_${nanoid(6)}`, ...data };
  return { state: { ...state, users: [...state.users, user] }, user };
}

export function removeUser(
  state: WorkspaceState,
  id: string,
): WorkspaceState {
  return {
    ...state,
    users: state.users.filter((u) => u.id !== id),
    projects: state.projects.map((p) => ({
      ...p,
      leadId: p.leadId === id ? undefined : p.leadId,
      memberIds: p.memberIds.filter((m) => m !== id),
    })),
    tasks: state.tasks.map((t) => ({
      ...t,
      assigneeId: t.assigneeId === id ? undefined : t.assigneeId,
    })),
  };
}

// ── Labels ──────────────────────────────────────────────────────────────────

export function addLabel(
  state: WorkspaceState,
  data: Omit<Label, "id">,
): { state: WorkspaceState; label: Label } {
  const label: Label = { id: `l_${nanoid(6)}`, ...data };
  return { state: { ...state, labels: [...state.labels, label] }, label };
}

export function removeLabel(
  state: WorkspaceState,
  id: string,
): WorkspaceState {
  return {
    ...state,
    labels: state.labels.filter((l) => l.id !== id),
    tasks: state.tasks.map((t) => ({
      ...t,
      labelIds: t.labelIds.filter((lid) => lid !== id),
    })),
  };
}

// ── Projects ────────────────────────────────────────────────────────────────

export function createProject(
  state: WorkspaceState,
  data: Partial<Project> & Pick<Project, "name" | "key">,
): { state: WorkspaceState; project: Project } {
  const project: Project = {
    id: `p_${nanoid(6)}`,
    key: data.key,
    name: data.name,
    description: data.description ?? "",
    status: data.status ?? "todo",
    priority: data.priority ?? "medium",
    leadId: data.leadId ?? state.currentUserId,
    memberIds: data.memberIds ?? [state.currentUserId],
    targetDate: data.targetDate,
    icon: data.icon ?? data.name.charAt(0).toUpperCase(),
    accent: data.accent ?? "#ff5c1a",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    nextTaskNumber: 1,
  };
  return {
    state: { ...state, projects: [project, ...state.projects] },
    project,
  };
}

export function updateProject(
  state: WorkspaceState,
  id: string,
  patch: Partial<Project>,
): WorkspaceState {
  return {
    ...state,
    projects: state.projects.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p,
    ),
  };
}

export function deleteProject(
  state: WorkspaceState,
  id: string,
): WorkspaceState {
  return {
    ...state,
    projects: state.projects.filter((p) => p.id !== id),
    tasks: state.tasks.filter((t) => t.projectId !== id),
  };
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export function createTask(
  state: WorkspaceState,
  data: Partial<Task> & Pick<Task, "projectId" | "title">,
): { state: WorkspaceState; task: Task } {
  const project = state.projects.find((p) => p.id === data.projectId);
  if (!project) {
    throw new Error(`Cannot create task: project ${data.projectId} not found`);
  }
  const number = project.nextTaskNumber;
  const task: Task = {
    id: `t_${nanoid(6)}`,
    projectId: data.projectId,
    number,
    type: data.type ?? "task",
    title: data.title,
    description: data.description ?? "",
    status: data.status ?? "todo",
    priority: data.priority ?? "medium",
    assigneeId: data.assigneeId,
    labelIds: data.labelIds ?? [],
    dueDate: data.dueDate,
    estimate: data.estimate,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    comments: [],
    activity: [
      {
        id: nanoid(6),
        at: nowIso(),
        authorId: state.currentUserId,
        message: `Created ${data.type ?? "task"}`,
      },
    ],
  };
  return {
    state: {
      ...state,
      tasks: [task, ...state.tasks],
      projects: state.projects.map((p) =>
        p.id === data.projectId
          ? { ...p, nextTaskNumber: p.nextTaskNumber + 1 }
          : p,
      ),
    },
    task,
  };
}

export function updateTask(
  state: WorkspaceState,
  id: string,
  patch: Partial<Task>,
): WorkspaceState {
  const existing = state.tasks.find((t) => t.id === id);
  if (!existing) return state;
  const entries: ActivityEntry[] = [];
  if (patch.status && patch.status !== existing.status) {
    entries.push({
      id: nanoid(6),
      at: nowIso(),
      authorId: state.currentUserId,
      message: `Status → ${patch.status.replace("_", " ")}`,
    });
  }
  if (patch.priority && patch.priority !== existing.priority) {
    entries.push({
      id: nanoid(6),
      at: nowIso(),
      authorId: state.currentUserId,
      message: `Priority → ${patch.priority}`,
    });
  }
  if (
    patch.assigneeId !== undefined &&
    patch.assigneeId !== existing.assigneeId
  ) {
    const u = state.users.find((x) => x.id === patch.assigneeId);
    entries.push({
      id: nanoid(6),
      at: nowIso(),
      authorId: state.currentUserId,
      message: u ? `Assigned to @${u.handle}` : "Unassigned",
    });
  }
  return {
    ...state,
    tasks: state.tasks.map((t) =>
      t.id === id
        ? {
            ...t,
            ...patch,
            updatedAt: nowIso(),
            activity: [...t.activity, ...entries],
          }
        : t,
    ),
  };
}

export function deleteTask(
  state: WorkspaceState,
  id: string,
): WorkspaceState {
  return { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
}

export function moveTaskStatus(
  state: WorkspaceState,
  id: string,
  status: Status,
): WorkspaceState {
  return updateTask(state, id, { status });
}

export function addComment(
  state: WorkspaceState,
  taskId: string,
  body: string,
): { state: WorkspaceState; comment: Comment | undefined } {
  const clean = body.trim();
  if (!clean) return { state, comment: undefined };
  const comment: Comment = {
    id: nanoid(6),
    authorId: state.currentUserId,
    body: clean,
    createdAt: nowIso(),
  };
  return {
    state: {
      ...state,
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              comments: [...t.comments, comment],
              activity: [
                ...t.activity,
                {
                  id: nanoid(6),
                  at: nowIso(),
                  authorId: state.currentUserId,
                  message: "Commented",
                },
              ],
            }
          : t,
      ),
    },
    comment,
  };
}

// ── Posts ───────────────────────────────────────────────────────────────────

export function createPost(
  state: WorkspaceState,
  data: Partial<Post> & Pick<Post, "title" | "platform">,
): { state: WorkspaceState; post: Post } {
  const post: Post = {
    id: `po_${nanoid(6)}`,
    projectId: data.projectId,
    title: data.title,
    platform: data.platform,
    status: data.status ?? "draft",
    scheduledAt: data.scheduledAt,
    postedAt: data.postedAt,
    threshold: data.threshold ?? {
      metric: "views",
      value: 100000,
      window: "7d",
    },
    snapshots: data.snapshots ?? [],
    content: data.content ?? {
      hook: "",
      caption: "",
      hashtags: [],
      transcript: "",
      format: "video",
      durationSec: undefined,
      hasTrendingAudio: false,
    },
    context: data.context ?? {
      audienceSize: 1000,
      accountAvgViews: 200,
      postingHour: 12,
      dayOfWeek: 2,
      topicCategory: "general",
      novelty: 3,
      emotion: 3,
      trendMatch: 3,
      sentiment: "neutral",
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return {
    state: { ...state, posts: [post, ...state.posts] },
    post,
  };
}

export function updatePost(
  state: WorkspaceState,
  id: string,
  patch: Partial<Post>,
): WorkspaceState {
  return {
    ...state,
    posts: state.posts.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p,
    ),
  };
}

export function deletePost(
  state: WorkspaceState,
  id: string,
): WorkspaceState {
  return { ...state, posts: state.posts.filter((p) => p.id !== id) };
}

export function duplicatePost(
  state: WorkspaceState,
  id: string,
  opts?: { titleSuffix?: string },
): { state: WorkspaceState; post: Post | undefined } {
  const original = state.posts.find((p) => p.id === id);
  if (!original) return { state, post: undefined };
  const suffix = opts?.titleSuffix ?? " (variant)";
  const copy: Post = {
    ...original,
    id: `po_${nanoid(6)}`,
    title: `${original.title}${suffix}`.trim(),
    status: "draft",
    scheduledAt: undefined,
    postedAt: undefined,
    snapshots: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return { state: { ...state, posts: [copy, ...state.posts] }, post: copy };
}

export function addSnapshot(
  state: WorkspaceState,
  postId: string,
  snapshot: Omit<EngagementSnapshot, "id" | "capturedAt">,
): { state: WorkspaceState; snapshot: EngagementSnapshot } {
  const snap: EngagementSnapshot = {
    id: nanoid(6),
    capturedAt: nowIso(),
    ...snapshot,
  };
  return {
    state: {
      ...state,
      posts: state.posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              snapshots: [...p.snapshots, snap].sort(
                (a, b) => a.atMinutes - b.atMinutes,
              ),
              updatedAt: nowIso(),
            }
          : p,
      ),
    },
    snapshot: snap,
  };
}

export function removeSnapshot(
  state: WorkspaceState,
  postId: string,
  snapshotId: string,
): WorkspaceState {
  return {
    ...state,
    posts: state.posts.map((p) =>
      p.id === postId
        ? {
            ...p,
            snapshots: p.snapshots.filter((x) => x.id !== snapshotId),
            updatedAt: nowIso(),
          }
        : p,
    ),
  };
}

// ── Theme + currentUser ────────────────────────────────────────────────────

export function setTheme(state: WorkspaceState, theme: Theme): WorkspaceState {
  return { ...state, theme };
}

export function setCurrentUser(
  state: WorkspaceState,
  id: string,
): WorkspaceState {
  return { ...state, currentUserId: id };
}
