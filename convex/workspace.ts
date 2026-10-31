import { getDocumentSize, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  fail,
  findByAppId,
  findMembership,
  loadDocs,
  loadViewBudgeted,
  trashRow,
  type Loaded,
  loadMembers,
  loadState,
  nowIso,
  requireMember,
  requireOwner,
  requireUserId,
  toRecord,
  writeDiff,
} from "./lib";
import { content as contentValidator, op as opValidator, seed as seedValidator, type Content } from "./validators";
import {
  Op,
  OpError,
  opScope,
  OWNER_ONLY_OPS,
  runOp,
  SEED_IDS,
  seededContext,
  type Deleted,
  type TrashLookup,
} from "../src/lib/ops";
import type { ProjectSnapshot, WorkspaceState } from "../src/lib/mutations";
import type { Post, Project, Task } from "../src/lib/types";
import { checkRecord, recordBytes, type RecordKind } from "../src/lib/limits";

/** One import (create with content, or replaceContent) must fit in one Convex transaction's writes. */
const IMPORT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Workspace functions: the reactive read model (`get`) and the single write
 * entry point (`apply`), plus lifecycle (create / rename / replaceContent /
 * deleteWorkspace). See src/lib/ops.ts for the protocol and convex/lib.ts
 * for loaders and the diff writer.
 */

const TRASH_TTL_DAYS = 7;
const MAX_SKEW_MS = 5 * 60 * 1000;
const ID_SHAPE = /^[A-Za-z0-9_-]{1,32}$/;

export interface WorkspaceView {
  id: Id<"workspaces">;
  name: string;
  role: "owner" | "member";
  state: WorkspaceState;
  /** Collections cut short because the workspace outgrew one read (see loadViewBudgeted). */
  truncated: RecordKind[];
}

/**
 * The whole workspace for the caller, or null when they are not (or no
 * longer) a member — null rather than an error so a membership revoked
 * mid-session degrades to the workspace picker instead of an error page.
 */
export const get = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }): Promise<WorkspaceView | null> => {
    const userId = await requireUserId(ctx);
    const membership = await findMembership(ctx, workspaceId, userId);
    const workspace = await ctx.db.get(workspaceId);
    if (!membership || !workspace) return null;
    const { state, truncated } = await loadViewBudgeted(ctx, workspaceId, userId);
    return { id: workspaceId, name: workspace.name, role: membership.role, state, truncated };
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const out: { id: Id<"workspaces">; name: string; role: "owner" | "member"; joinedAt: string }[] = [];
    for (const m of memberships) {
      const w = await ctx.db.get(m.workspaceId);
      if (w) out.push({ id: w._id, name: w.name, role: m.role, joinedAt: m.joinedAt });
    }
    return out.sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : 1));
  },
});

interface Trash {
  lookup: TrashLookup;
  /** Rows a successful restore consumes. */
  rows: Doc<"trash">[];
  /** Ids this restore brings back (reserved by the rows above). */
  restoring: Set<string>;
}

const NO_TRASH: Trash = {
  lookup: { project: () => undefined, task: () => undefined, post: () => undefined },
  rows: [],
  restoring: new Set(),
};

/**
 * For a restore op, read what the trash holds for it. A project comes back
 * with every issue that was deleted along with it (its `group`).
 */
async function trashLookup(ctx: MutationCtx, workspaceId: Id<"workspaces">, op: Op): Promise<Trash> {
  if (op.type === "restoreProject") {
    const row = await trashRow(ctx, workspaceId, "project", op.id);
    if (!row) return NO_TRASH;
    const taskRows = await ctx.db
      .query("trash")
      .withIndex("by_workspace_group", (q) => q.eq("workspaceId", workspaceId).eq("group", op.id))
      .collect();
    const snapshot: ProjectSnapshot = {
      project: row.snapshot as Project,
      tasks: taskRows.filter((r) => r.kind === "task").map((r) => r.snapshot as Task),
    };
    return {
      lookup: { ...NO_TRASH.lookup, project: (id) => (id === op.id ? snapshot : undefined) },
      rows: [row, ...taskRows],
      restoring: new Set([op.id, ...snapshot.tasks.map((t) => t.id)]),
    };
  }
  if (op.type === "restoreTask" || op.type === "restorePost") {
    const kind = op.type === "restoreTask" ? "task" : "post";
    const row = await trashRow(ctx, workspaceId, kind, op.id);
    if (!row) return NO_TRASH;
    return {
      lookup: {
        ...NO_TRASH.lookup,
        task: (id) => (kind === "task" && id === op.id ? (row.snapshot as Task) : undefined),
        post: (id) => (kind === "post" && id === op.id ? (row.snapshot as Post) : undefined),
      },
      rows: [row],
      restoring: new Set([op.id]),
    };
  }
  return NO_TRASH;
}

/**
 * One delete moves a project and all its issues into the trash in one
 * transaction, and its Undo moves them back in one. Convex allows 16 MiB
 * read, 16 MiB / 16,000 documents written and 4,096 queries per
 * transaction. Each issue costs two writes either way (delete + trash
 * insert, or insert + trash delete) and is read twice (loaded, then
 * re-read by its delete); the query count is constant. These caps keep
 * both directions well inside every limit.
 */
const DELETE_MAX_BYTES = 5 * 1024 * 1024;
export const DELETE_MAX_RECORDS = 3000;

function validateSeed(seed: { ids: string[]; now: string }): { ids: string[]; now: string } {
  if (seed.ids.length > SEED_IDS * 2) fail("Validation", "Too many seed ids");
  const seen = new Set<string>();
  for (const id of seed.ids) {
    if (!ID_SHAPE.test(id) || seen.has(id)) fail("Validation", `Invalid seed id ${id}`);
    seen.add(id);
  }
  const client = Date.parse(seed.now);
  const server = Date.now();
  // Always store canonical ISO: ordering (createdAt) and the trash purge
  // (deletedAt) compare these strings lexicographically.
  const now = new Date(Number.isFinite(client) && Math.abs(client - server) <= MAX_SKEW_MS ? client : server).toISOString();
  return { ids: seed.ids, now };
}

/**
 * Replay one op for the calling member. Loads only what the op reads
 * (opScope), runs the shared pure mutation with the caller as actor and the
 * client's seed for ids/time, writes the difference, and returns the op's
 * result (the created record, for instance). Convex's OCC serializes
 * overlapping transactions, so per-project task numbers stay gap-free.
 */
export const apply = mutation({
  args: { workspaceId: v.id("workspaces"), op: opValidator, seed: seedValidator },
  handler: async (ctx, { workspaceId, op: wireOp, seed: rawSeed }) => {
    const member = await requireMember(ctx, workspaceId);
    const op = wireOp as Op;
    if (OWNER_ONLY_OPS.has(op.type)) requireOwner(member);
    const seed = validateSeed(rawSeed);
    const scope = opScope(op);
    const [{ state, docs }, trash] = await Promise.all([
      loadState(ctx, workspaceId, member.userId, scope),
      trashLookup(ctx, workspaceId, op),
    ]);
    await checkBeforeReplay(ctx, workspaceId, op, state, docs, trash);
    let result;
    try {
      result = runOp(state, op, seededContext(seed, { actorId: member.userId, trash: trash.lookup }));
    } catch (err) {
      if (err instanceof OpError) fail(err.code, err.message);
      throw err;
    }
    const opts = { restoring: trash.restoring };
    await writeDiff(ctx, "labels", workspaceId, docs.labels, result.state.labels, opts);
    await writeDiff(ctx, "projects", workspaceId, docs.projects, result.state.projects, opts);
    await writeDiff(ctx, "tasks", workspaceId, docs.tasks, result.state.tasks, opts);
    await writeDiff(ctx, "posts", workspaceId, docs.posts, result.state.posts, opts);
    if (result.deleted) await stash(ctx, workspaceId, member.userId, result.deleted, seed.now);
    for (const row of trash.rows) await ctx.db.delete(row._id);
    return result.result ?? null;
  },
});

/**
 * Conditions the pure mutations cannot see because they depend on rows
 * outside the op's read scope or on the trash.
 */
async function checkBeforeReplay(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  op: Op,
  state: WorkspaceState,
  docs: Loaded["docs"],
  trash: Trash,
): Promise<void> {
  switch (op.type) {
    case "deleteProject": {
      // The project and every issue in it move to the trash in this one
      // transaction; refuse a delete that could not fit rather than fail
      // with a platform error.
      if (docs.tasks.length > DELETE_MAX_RECORDS) {
        fail(
          "Validation",
          `This project has ${docs.tasks.length} issues; one delete can move at most ${DELETE_MAX_RECORDS}. Delete some of its issues first.`,
        );
      }
      const bytes = docs.tasks.reduce((n, d) => n + getDocumentSize(d as never), 0);
      if (bytes > DELETE_MAX_BYTES) {
        fail(
          "Validation",
          `This project holds ${(bytes / 1024 / 1024).toFixed(1)} MB of issues; one delete can move at most ${DELETE_MAX_BYTES / 1024 / 1024} MB. Delete some of its issues first.`,
        );
      }
      return;
    }
    case "restoreProject":
    case "restoreTask":
    case "restorePost": {
      if (trash.rows.length === 0) return; // runOp reports "not in the trash"
      // The pure restores silently do nothing when the id is live again;
      // never let that consume the trash row.
      const live =
        op.type === "restoreProject"
          ? state.projects.some((p) => p.id === op.id)
          : op.type === "restoreTask"
            ? state.tasks.some((t) => t.id === op.id)
            : state.posts.some((p) => p.id === op.id);
      if (live) fail("Conflict", "That record already exists; there is nothing to restore");
      if (op.type === "restoreTask") {
        const task = trash.lookup.task(op.id)!;
        if (!(await findByAppId(ctx, "projects", workspaceId, task.projectId))) {
          fail("Conflict", "This issue's project has been deleted. Restore the project to bring the issue back.");
        }
      }
      return;
    }
    default:
      return;
  }
}

/** Move what a delete removed into the trash, one row per record. */
async function stash(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  deletedBy: Id<"users">,
  deleted: Deleted,
  deletedAt: string,
) {
  const put = async (kind: "project" | "task" | "post", id: string, snapshot: unknown, group?: string) => {
    await ctx.db.insert("trash", { workspaceId, kind, id, snapshot, deletedAt, deletedBy, ...(group ? { group } : {}) });
  };
  // A row with the deleted record's id cannot normally exist (ids in the
  // trash are reserved); replace defensively rather than keep two. Only the
  // top-level record is checked: one query, not one per cascaded issue, so a
  // project delete stays at a constant number of queries.
  const topId = deleted.kind === "project" ? deleted.snapshot.project.id : deleted.snapshot.id;
  const existing = await trashRow(ctx, workspaceId, deleted.kind, topId);
  if (existing) await ctx.db.delete(existing._id);
  if (deleted.kind === "project") {
    const { project, tasks } = deleted.snapshot;
    await put("project", project.id, project);
    for (const t of tasks) await put("task", t.id, t, project.id);
  } else {
    await put(deleted.kind, deleted.snapshot.id, deleted.snapshot);
  }
}

// ── Import / content replacement ────────────────────────────────────────────

/**
 * Bring a local workspace's content into the cloud. Local user ids mean
 * nothing here: the importer's own id (`fromUserId`, the local
 * currentUserId) becomes the caller, and other assignee/lead/member
 * references survive only if they name a current member.
 *
 * Comment and activity authors are history, and attribution must come from
 * the server: only the importer's own entries become theirs. Every other
 * author is rewritten to `imported:<original id>`, which can never match an
 * account, so an import cannot put words in a real member's mouth (the UI
 * shows such entries as from a former member). System activity (no author)
 * stays authorless.
 */
export const IMPORTED_AUTHOR_PREFIX = "imported:";
export function remapContent(
  content: Content,
  fromUserId: string | undefined,
  callerId: Id<"users">,
  memberIds: ReadonlySet<string>,
): Content {
  const isImporter = (id: string | undefined) => fromUserId !== undefined && id === fromUserId;
  const map = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : isImporter(id) ? callerId : memberIds.has(id) ? id : undefined;
  const author = <A extends string | undefined>(id: A): string | A =>
    id === undefined ? id : isImporter(id) ? callerId : id.startsWith(IMPORTED_AUTHOR_PREFIX) ? id : `${IMPORTED_AUTHOR_PREFIX}${id}`;
  return {
    labels: content.labels,
    projects: content.projects.map((p) => ({
      ...p,
      leadId: map(p.leadId),
      memberIds: p.memberIds.map(map).filter((x): x is string => x !== undefined),
    })),
    tasks: content.tasks.map((t) => ({
      ...t,
      assigneeId: map(t.assigneeId),
      comments: t.comments.map((c) => ({ ...c, authorId: author(c.authorId) })),
      activity: t.activity.map((a) => ({ ...a, authorId: author(a.authorId) })),
    })),
    posts: content.posts,
  };
}

function checkContent(content: Content) {
  const uniq = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!ID_SHAPE.test(id) && !/^[A-Za-z0-9_-]{1,64}$/.test(id)) fail("Validation", `Invalid ${what} id ${id}`);
      if (seen.has(id)) fail("Validation", `Duplicate ${what} id ${id}`);
      seen.add(id);
    }
  };
  uniq(content.labels.map((l) => l.id), "label");
  uniq(content.projects.map((p) => p.id), "project");
  uniq(content.tasks.map((t) => t.id), "task");
  uniq(content.posts.map((p) => p.id), "post");
  const projectIds = new Set(content.projects.map((p) => p.id));
  for (const t of content.tasks) {
    if (!projectIds.has(t.projectId)) fail("Validation", `Task ${t.id} references unknown project ${t.projectId}`);
  }
  let total = 0;
  const each = <R extends { id: string }>(kind: RecordKind, records: R[]) => {
    for (const r of records) {
      const problem = checkRecord(kind, r as never);
      if (problem) fail("Validation", `${problem} (${r.id})`);
      total += recordBytes(r);
    }
  };
  each("labels", content.labels);
  each("projects", content.projects);
  each("tasks", content.tasks);
  each("posts", content.posts);
  if (total > IMPORT_MAX_BYTES) {
    fail(
      "Validation",
      `This import is ${(total / 1024 / 1024).toFixed(1)} MB; one import can be at most ${IMPORT_MAX_BYTES / 1024 / 1024} MB. Split it, or remove old posts and issues first.`,
    );
  }
}

async function insertContent(ctx: MutationCtx, workspaceId: Id<"workspaces">, content: Content) {
  for (const l of content.labels) await ctx.db.insert("labels", { ...l, workspaceId });
  for (const p of content.projects) await ctx.db.insert("projects", { ...p, workspaceId });
  for (const t of content.tasks) await ctx.db.insert("tasks", { ...t, workspaceId });
  for (const p of content.posts) await ctx.db.insert("posts", { ...p, workspaceId });
}

/**
 * Everything a workspace holds, for replaceContent: read once, measured,
 * then deleted. Convex counts a delete as reading the document again, so a
 * replacement costs twice the existing content in reads (plus the import's
 * writes); refuse one that would not fit rather than fail mid-way.
 */
const REPLACE_MAX_EXISTING_BYTES = 3 * 1024 * 1024;

async function replaceExistingContent(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const docs: Id<"labels" | "projects" | "tasks" | "posts" | "trash">[] = [];
  let bytes = 0;
  for (const table of ["labels", "projects", "tasks", "posts"] as const) {
    for (const d of await loadDocs(ctx, table, workspaceId, "all")) {
      bytes += getDocumentSize(d as never);
      docs.push(d._id);
    }
  }
  for (const d of await ctx.db
    .query("trash")
    .withIndex("by_workspace_kind_id", (q) => q.eq("workspaceId", workspaceId))
    .collect()) {
    bytes += getDocumentSize(d as never);
    docs.push(d._id);
  }
  if (bytes > REPLACE_MAX_EXISTING_BYTES) {
    fail(
      "Validation",
      `This workspace already holds ${(bytes / 1024 / 1024).toFixed(1)} MB, too much to replace in one step. Create a new workspace from the export instead (and delete this one if you no longer need it).`,
    );
  }
  for (const id of docs) await ctx.db.delete(id);
}

/** Bytes one background deletion pass may touch (each delete re-reads its document). */
const DELETE_PASS_MAX_BYTES = 6 * 1024 * 1024;
const DELETE_PASS_MAX_DOCS = 2000;

/**
 * Background cleanup after deleteWorkspace: the workspace and its
 * memberships are already gone, so nobody can reach this content; delete it
 * in budgeted passes, scheduling the next until nothing is left.
 */
export const deleteWorkspaceContent = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    let bytes = 0;
    let count = 0;
    let more = false;
    const scan = async <T extends "labels" | "projects" | "tasks" | "posts" | "trash">(table: T) => {
      const q =
        table === "trash"
          ? ctx.db.query("trash").withIndex("by_workspace_kind_id", (r) => r.eq("workspaceId", workspaceId))
          : ctx.db.query(table as "tasks").withIndex("by_workspace", (r) => r.eq("workspaceId", workspaceId));
      const doomed: Id<T>[] = [];
      for await (const d of q as AsyncIterable<{ _id: Id<T> }>) {
        const size = getDocumentSize(d as never);
        if (count >= DELETE_PASS_MAX_DOCS || bytes + 2 * size > DELETE_PASS_MAX_BYTES) {
          more = true;
          break;
        }
        bytes += 2 * size;
        count++;
        doomed.push(d._id);
      }
      for (const id of doomed) await ctx.db.delete(id);
    };
    for (const table of ["tasks", "posts", "projects", "labels", "trash"] as const) {
      if (more) break;
      await scan(table);
    }
    if (more) await ctx.scheduler.runAfter(0, internal.workspace.deleteWorkspaceContent, { workspaceId });
    return count;
  },
});

const contentArgs = {
  content: v.optional(contentValidator),
  /** The local workspace's currentUserId, remapped to the caller. */
  fromUserId: v.optional(v.string()),
};

export const create = mutation({
  args: { name: v.string(), ...contentArgs },
  handler: async (ctx, { name, content, fromUserId }) => {
    const userId = await requireUserId(ctx);
    const clean = name.trim().slice(0, 80);
    if (!clean) fail("Validation", "Workspace name is required");
    const now = nowIso();
    const workspaceId = await ctx.db.insert("workspaces", { name: clean, createdBy: userId, createdAt: now });
    await ctx.db.insert("members", { workspaceId, userId, role: "owner", joinedAt: now });
    if (content) {
      checkContent(content);
      await insertContent(ctx, workspaceId, remapContent(content, fromUserId, userId, new Set([userId])));
    }
    return workspaceId;
  },
});

export const rename = mutation({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  handler: async (ctx, { workspaceId, name }) => {
    requireOwner(await requireMember(ctx, workspaceId));
    const clean = name.trim().slice(0, 80);
    if (!clean) fail("Validation", "Workspace name is required");
    await ctx.db.patch(workspaceId, { name: clean });
  },
});

/** Owner-only: replace every label/project/task/post with an imported set. */
export const replaceContent = mutation({
  args: { workspaceId: v.id("workspaces"), content: contentValidator, fromUserId: v.optional(v.string()) },
  handler: async (ctx, { workspaceId, content, fromUserId }) => {
    const member = await requireMember(ctx, workspaceId);
    requireOwner(member);
    checkContent(content);
    const { members } = await loadMembers(ctx, workspaceId);
    await replaceExistingContent(ctx, workspaceId);
    await insertContent(
      ctx,
      workspaceId,
      remapContent(content, fromUserId, member.userId, new Set(members.map((m) => m.userId as string))),
    );
  },
});

/**
 * Delete a workspace. Access ends in this transaction (memberships,
 * invites and the workspace itself go now); the content, however large, is
 * deleted in the background by deleteWorkspaceContent.
 */
export const deleteWorkspace = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    requireOwner(await requireMember(ctx, workspaceId));
    for (const m of await ctx.db.query("members").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) {
      await ctx.db.delete(m._id);
    }
    for (const i of await ctx.db.query("invites").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) {
      await ctx.db.delete(i._id);
    }
    await ctx.db.delete(workspaceId);
    await ctx.scheduler.runAfter(0, internal.workspace.deleteWorkspaceContent, { workspaceId });
  },
});

/**
 * One purge pass reads at most this much. Convex fails a function past
 * 16 MiB / 32,000 documents read, and a delete re-reads its document, so
 * every row is counted twice.
 */
const PURGE_MAX_BYTES = 6 * 1024 * 1024;
const PURGE_MAX_DOCS = 2000;

/**
 * Called by crons.ts: drop trash older than TRASH_TTL_DAYS. Each pass
 * reads against a byte and document budget (rows can hold whole records),
 * and if stale rows remain it schedules the next pass right away, so a
 * backlog drains in minutes instead of one fixed batch per day.
 */
export const purgeTrash = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const doomed: Id<"trash">[] = [];
    let bytes = 0;
    let more = false;
    for await (const d of ctx.db.query("trash").withIndex("by_deletedAt", (q) => q.lt("deletedAt", cutoff))) {
      const size = getDocumentSize(d as never);
      if (doomed.length >= PURGE_MAX_DOCS || bytes + 2 * size > PURGE_MAX_BYTES) {
        more = true;
        break;
      }
      bytes += 2 * size;
      doomed.push(d._id);
    }
    for (const id of doomed) await ctx.db.delete(id);
    if (more) await ctx.scheduler.runAfter(0, internal.workspace.purgeTrash, {});
    return doomed.length;
  },
});

/** Convert a stored record set back to the app's export shape (used by tests and tooling). */
export function contentOf(state: WorkspaceState): Content {
  return {
    labels: state.labels,
    projects: state.projects as Project[],
    tasks: state.tasks,
    posts: state.posts,
  };
}

export { toRecord };
