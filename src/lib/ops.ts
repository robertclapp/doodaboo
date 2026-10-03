import { nanoid } from "nanoid";
import {
  ActorContext,
  ReferenceNotFoundError,
  addComment,
  addLabel,
  addSnapshot,
  createPost,
  createProject,
  createTask,
  deletePost,
  deleteProject,
  deleteTask,
  duplicatePost,
  moveTaskStatus,
  ProjectSnapshot,
  removeLabel,
  removeSnapshot,
  restorePost,
  restoreProject,
  restoreTask,
  snapshotProject,
  updatePost,
  updateProject,
  updateTask,
  WorkspaceState,
} from "./mutations";
import type {
  EngagementSnapshot,
  Label,
  Post,
  Project,
  Status,
  Task,
} from "./types";

/**
 * The operation protocol between a client and the cloud backend.
 *
 * In cloud mode every workspace edit is an `Op` — a tagged value that names
 * one of the pure mutations in ./mutations.ts and carries its arguments. The
 * browser applies the op optimistically to its mirror of the workspace, and
 * the Convex mutation `workspace.apply` replays the very same op on the
 * server against the same pure function. Both sides therefore share every
 * business rule (task numbering, activity attribution, identity-field
 * stripping) and there is exactly one implementation to test.
 *
 * Two things make the replay byte-identical rather than merely equivalent:
 *
 *   - `Seed`: the client pre-draws the ids the op may need and the wall-clock
 *     time it happened, and sends both with the op. `seededContext` turns a
 *     seed into the `ids`/`now` generators of an `ActorContext`, so the
 *     server's copy of a created task has the same `t_…` id the client
 *     already navigated to. The server clamps `now` to a small skew window.
 *   - `actorId` is never part of an op. The server derives it from the
 *     signed-in user; the client from its mirror's `currentUserId`.
 *
 * Update ops carry an explicit `unset` list for fields the client is
 * clearing: `undefined` object properties do not survive Convex's wire
 * encoding, so "unassign" sent as `{assigneeId: undefined}` would arrive as
 * an empty patch. `patchOf` rebuilds the real `undefined`s on both sides.
 *
 * Restores are the one asymmetric case: deletes move records to a trash on
 * the server, so a restore op carries only an id and both sides look the
 * record up through `OpContext.trash` (the server in its trash table, the
 * client in the records it deleted this session).
 */

export type Op =
  | { type: "addLabel"; data: Omit<Label, "id"> }
  | { type: "removeLabel"; id: string }
  | {
      type: "createProject";
      data: Partial<Project> & Pick<Project, "name" | "key">;
    }
  | { type: "updateProject"; id: string; patch: Partial<Project>; unset?: string[] }
  | { type: "deleteProject"; id: string }
  | { type: "restoreProject"; id: string }
  | {
      type: "createTask";
      data: Partial<Task> & Pick<Task, "projectId" | "title">;
    }
  | { type: "updateTask"; id: string; patch: Partial<Task>; unset?: string[] }
  | { type: "deleteTask"; id: string }
  | { type: "restoreTask"; id: string }
  | { type: "moveTaskStatus"; id: string; status: Status }
  | { type: "addComment"; taskId: string; body: string }
  | {
      type: "createPost";
      data: Partial<Post> & Pick<Post, "title" | "platform">;
    }
  | { type: "updatePost"; id: string; patch: Partial<Post>; unset?: string[] }
  | { type: "deletePost"; id: string }
  | { type: "restorePost"; id: string }
  | { type: "duplicatePost"; id: string; titleSuffix?: string }
  | {
      type: "addSnapshot";
      postId: string;
      snapshot: Omit<EngagementSnapshot, "id" | "capturedAt">;
    }
  | { type: "removeSnapshot"; postId: string; snapshotId: string };

export type OpType = Op["type"];

/** Pre-drawn ids and the client's wall-clock time for one op. */
export interface Seed {
  ids: string[];
  now: string;
}

/**
 * The most ids any single op draws: a task update can add three activity
 * entries. Drawing more than needed is harmless — unused ids are dropped.
 */
export const SEED_IDS = 6;

export function drawSeed(now: Date = new Date()): Seed {
  return {
    ids: Array.from({ length: SEED_IDS }, () => nanoid(6)),
    now: now.toISOString(),
  };
}

/** Records a delete op removed, so a restore can bring them back. */
export type Deleted =
  | { kind: "project"; snapshot: ProjectSnapshot }
  | { kind: "task"; snapshot: Task }
  | { kind: "post"; snapshot: Post };

export interface TrashLookup {
  project(id: string): ProjectSnapshot | undefined;
  task(id: string): Task | undefined;
  post(id: string): Post | undefined;
}

export interface OpContext extends ActorContext {
  trash?: TrashLookup;
}

/**
 * Build the generators for a replay. Ids come from the seed in order; if an
 * op ever needs more than were drawn (it cannot today, see SEED_IDS) the
 * generator falls back to a fresh nanoid rather than failing.
 */
export function seededContext(
  seed: Seed,
  base: OpContext = {},
): OpContext {
  let i = 0;
  return {
    ...base,
    ids: () => (i < seed.ids.length ? seed.ids[i++] : nanoid(6)),
    now: () => seed.now,
  };
}

export class OpError extends Error {
  constructor(
    public readonly code: "NotFound" | "Validation",
    message: string,
  ) {
    super(message);
    this.name = "OpError";
  }
}

/** Fields a client may clear on each record type; anything else in `unset` is rejected. */
export const CLEARABLE: Record<"project" | "task" | "post", ReadonlySet<string>> = {
  project: new Set(["leadId", "targetDate", "icon", "accent"]),
  task: new Set(["assigneeId", "dueDate", "estimate"]),
  post: new Set(["projectId", "scheduledAt", "postedAt", "playbookId"]),
};

/** Split a UI patch into wire form: defined fields, plus the keys being cleared. */
export function toWirePatch<T extends object>(patch: T): { patch: Partial<T>; unset?: string[] } {
  const defined: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) unset.push(k);
    else defined[k] = v;
  }
  return unset.length ? { patch: defined as Partial<T>, unset } : { patch: defined as Partial<T> };
}

/** Rebuild the patch the pure mutation expects: cleared keys become real `undefined`s. */
function patchOf<T extends object>(
  kind: keyof typeof CLEARABLE,
  patch: Partial<T>,
  unset: string[] | undefined,
): Partial<T> {
  if (!unset?.length) return patch;
  const out: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
  for (const k of unset) {
    if (!CLEARABLE[kind].has(k)) throw new OpError("Validation", `${k} cannot be cleared on a ${kind}`);
    out[k] = undefined;
  }
  return out as Partial<T>;
}

export interface OpResult {
  state: WorkspaceState;
  /** The created/affected record for ops that produce one. */
  result: Project | Task | Post | EngagementSnapshot | Label | unknown;
  /** What a delete op removed (for the caller's trash). */
  deleted?: Deleted;
}

const requireProject = (state: WorkspaceState, id: string) => {
  const p = state.projects.find((x) => x.id === id);
  if (!p) throw new OpError("NotFound", `Project ${id} not found`);
  return p;
};
const requireTask = (state: WorkspaceState, id: string) => {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) throw new OpError("NotFound", `Task ${id} not found`);
  return t;
};
const requirePost = (state: WorkspaceState, id: string) => {
  const p = state.posts.find((x) => x.id === id);
  if (!p) throw new OpError("NotFound", `Post ${id} not found`);
  return p;
};
const requireLabel = (state: WorkspaceState, id: string) => {
  const l = state.labels.find((x) => x.id === id);
  if (!l) throw new OpError("NotFound", `Label ${id} not found`);
  return l;
};

/**
 * Apply one op to a workspace state. Pure apart from the generators in
 * `ctx`. Throws OpError for a missing target so a stale op (the record was
 * deleted by a teammate) fails loudly instead of silently no-op'ing.
 */
export function runOp(
  state: WorkspaceState,
  op: Op,
  ctx: OpContext = {},
): OpResult {
  try {
    return dispatch(state, op, ctx);
  } catch (err) {
    // The pure layer reports a missing reference (e.g. createTask under an
    // unknown project) with its own error class; surface it as NotFound so
    // the server maps it like every other stale-target failure.
    if (err instanceof ReferenceNotFoundError) throw new OpError("NotFound", err.message);
    throw err;
  }
}

function dispatch(state: WorkspaceState, op: Op, ctx: OpContext): OpResult {
  switch (op.type) {
    case "addLabel": {
      const r = addLabel(state, op.data, ctx);
      return { state: r.state, result: r.label };
    }
    case "removeLabel": {
      requireLabel(state, op.id);
      return { state: removeLabel(state, op.id), result: undefined };
    }
    case "createProject": {
      const r = createProject(state, op.data, ctx);
      return { state: r.state, result: r.project };
    }
    case "updateProject": {
      requireProject(state, op.id);
      return {
        state: updateProject(state, op.id, patchOf("project", op.patch, op.unset), ctx),
        result: undefined,
      };
    }
    case "deleteProject": {
      const snapshot = snapshotProject(state, op.id);
      if (!snapshot) throw new OpError("NotFound", `Project ${op.id} not found`);
      return {
        state: deleteProject(state, op.id),
        result: undefined,
        deleted: { kind: "project", snapshot },
      };
    }
    case "restoreProject": {
      const snapshot = ctx.trash?.project(op.id);
      if (!snapshot) throw new OpError("NotFound", `Project ${op.id} is not in the trash`);
      return { state: restoreProject(state, snapshot), result: snapshot.project };
    }
    case "createTask": {
      const r = createTask(state, op.data, ctx);
      return { state: r.state, result: r.task };
    }
    case "updateTask": {
      requireTask(state, op.id);
      return {
        state: updateTask(state, op.id, patchOf("task", op.patch, op.unset), ctx),
        result: undefined,
      };
    }
    case "deleteTask": {
      const snapshot = requireTask(state, op.id);
      return {
        state: deleteTask(state, op.id),
        result: undefined,
        deleted: { kind: "task", snapshot },
      };
    }
    case "restoreTask": {
      const snapshot = ctx.trash?.task(op.id);
      if (!snapshot) throw new OpError("NotFound", `Task ${op.id} is not in the trash`);
      return { state: restoreTask(state, snapshot), result: snapshot };
    }
    case "moveTaskStatus": {
      requireTask(state, op.id);
      return { state: moveTaskStatus(state, op.id, op.status, ctx), result: undefined };
    }
    case "addComment": {
      requireTask(state, op.taskId);
      const r = addComment(state, op.taskId, op.body, ctx);
      return { state: r.state, result: r.comment };
    }
    case "createPost": {
      const r = createPost(state, op.data, ctx);
      return { state: r.state, result: r.post };
    }
    case "updatePost": {
      requirePost(state, op.id);
      return {
        state: updatePost(state, op.id, patchOf("post", op.patch, op.unset), ctx),
        result: undefined,
      };
    }
    case "deletePost": {
      const snapshot = requirePost(state, op.id);
      return {
        state: deletePost(state, op.id),
        result: undefined,
        deleted: { kind: "post", snapshot },
      };
    }
    case "restorePost": {
      const snapshot = ctx.trash?.post(op.id);
      if (!snapshot) throw new OpError("NotFound", `Post ${op.id} is not in the trash`);
      return { state: restorePost(state, snapshot), result: snapshot };
    }
    case "duplicatePost": {
      requirePost(state, op.id);
      const r = duplicatePost(
        state,
        op.id,
        op.titleSuffix === undefined ? undefined : { titleSuffix: op.titleSuffix },
        ctx,
      );
      return { state: r.state, result: r.post };
    }
    case "addSnapshot": {
      requirePost(state, op.postId);
      try {
        const r = addSnapshot(state, op.postId, op.snapshot, ctx);
        return { state: r.state, result: r.snapshot };
      } catch (err) {
        throw new OpError("Validation", err instanceof Error ? err.message : String(err));
      }
    }
    case "removeSnapshot": {
      requirePost(state, op.postId);
      return {
        state: removeSnapshot(state, op.postId, op.snapshotId, ctx),
        result: undefined,
      };
    }
  }
}

// ── Read scopes ─────────────────────────────────────────────────────────────

/**
 * What an op reads, per collection. The server loads only this much before
 * replaying, so two members editing different tasks do not conflict with
 * each other under Convex's optimistic concurrency control, and a large
 * workspace never has to be read whole for a one-record edit.
 *
 *   "all"        the whole collection
 *   "none"       nothing (the op only inserts into it)
 *   { id }       one record by app id
 *   { projectId } every task of one project
 *
 * Users (the member list) are always loaded: they are small and several
 * mutations name an assignee in an activity message.
 */
export type CollectionScope =
  | "all"
  | "none"
  | { id: string }
  | { projectId: string };

export interface OpScope {
  labels: CollectionScope;
  projects: CollectionScope;
  tasks: CollectionScope;
  posts: CollectionScope;
}

const NONE: OpScope = { labels: "none", projects: "none", tasks: "none", posts: "none" };

export function opScope(op: Op): OpScope {
  switch (op.type) {
    case "addLabel":
      return { ...NONE, labels: "all" };
    case "removeLabel":
      return { ...NONE, labels: "all", tasks: "all" };
    case "createProject":
      return NONE;
    case "updateProject":
      return { ...NONE, projects: { id: op.id } };
    case "deleteProject":
    case "restoreProject":
      return { ...NONE, projects: { id: op.id }, tasks: { projectId: op.id } };
    case "createTask":
      return { ...NONE, projects: { id: op.data.projectId } };
    case "updateTask":
    case "deleteTask":
    case "restoreTask":
    case "moveTaskStatus":
      return { ...NONE, tasks: { id: op.id } };
    case "addComment":
      return { ...NONE, tasks: { id: op.taskId } };
    case "createPost":
      return NONE;
    case "updatePost":
    case "deletePost":
    case "restorePost":
    case "duplicatePost":
      return { ...NONE, posts: { id: op.id } };
    case "addSnapshot":
    case "removeSnapshot":
      return { ...NONE, posts: { id: op.postId } };
  }
}

/** Ops only a workspace owner may run: each is destructive at scale. */
export const OWNER_ONLY_OPS: ReadonlySet<OpType> = new Set<OpType>([
  "deleteProject",
  "removeLabel",
]);
