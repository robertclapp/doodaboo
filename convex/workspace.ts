import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  fail,
  findMembership,
  FULL_SCOPE,
  loadDocs,
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
    const { state } = await loadState(ctx, workspaceId, userId, FULL_SCOPE);
    return { id: workspaceId, name: workspace.name, role: membership.role, state };
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

async function trashLookup(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  op: Op,
): Promise<{ lookup: TrashLookup; doc: Doc<"trash"> | null }> {
  const kind =
    op.type === "restoreProject" ? "project" : op.type === "restoreTask" ? "task" : op.type === "restorePost" ? "post" : null;
  if (!kind) return { lookup: { project: () => undefined, task: () => undefined, post: () => undefined }, doc: null };
  const doc = await ctx.db
    .query("trash")
    .withIndex("by_workspace_kind_id", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind).eq("id", (op as { id: string }).id))
    .unique();
  const snapshot = doc?.snapshot;
  return {
    doc,
    lookup: {
      project: () => (kind === "project" ? (snapshot as ProjectSnapshot | undefined) : undefined),
      task: () => (kind === "task" ? (snapshot as Task | undefined) : undefined),
      post: () => (kind === "post" ? (snapshot as Post | undefined) : undefined),
    },
  };
}

function validateSeed(seed: { ids: string[]; now: string }): { ids: string[]; now: string } {
  if (seed.ids.length > SEED_IDS * 2) fail("Validation", "Too many seed ids");
  const seen = new Set<string>();
  for (const id of seed.ids) {
    if (!ID_SHAPE.test(id) || seen.has(id)) fail("Validation", `Invalid seed id ${id}`);
    seen.add(id);
  }
  const client = Date.parse(seed.now);
  const server = Date.now();
  const now = Number.isFinite(client) && Math.abs(client - server) <= MAX_SKEW_MS ? seed.now : new Date(server).toISOString();
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
    let result;
    try {
      result = runOp(state, op, seededContext(seed, { actorId: member.userId, trash: trash.lookup }));
    } catch (err) {
      if (err instanceof OpError) fail(err.code, err.message);
      throw err;
    }
    await writeDiff(ctx, "labels", workspaceId, docs.labels, result.state.labels);
    await writeDiff(ctx, "projects", workspaceId, docs.projects, result.state.projects);
    await writeDiff(ctx, "tasks", workspaceId, docs.tasks, result.state.tasks);
    await writeDiff(ctx, "posts", workspaceId, docs.posts, result.state.posts);
    if (result.deleted) await stash(ctx, workspaceId, member.userId, result.deleted, seed.now);
    if (trash.doc) await ctx.db.delete(trash.doc._id);
    return result.result ?? null;
  },
});

async function stash(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  deletedBy: Id<"users">,
  deleted: Deleted,
  deletedAt: string,
) {
  const id = deleted.kind === "project" ? deleted.snapshot.project.id : deleted.snapshot.id;
  const existing = await ctx.db
    .query("trash")
    .withIndex("by_workspace_kind_id", (q) => q.eq("workspaceId", workspaceId).eq("kind", deleted.kind).eq("id", id))
    .unique();
  if (existing) await ctx.db.delete(existing._id);
  await ctx.db.insert("trash", { workspaceId, kind: deleted.kind, id, snapshot: deleted.snapshot, deletedAt, deletedBy });
}

// ── Import / content replacement ────────────────────────────────────────────

/**
 * Bring a local workspace's content into the cloud. Local user ids mean
 * nothing here: the importer's own id (`fromUserId`, the local
 * currentUserId) becomes the caller, every other assignee/lead/member
 * reference is dropped, and comment/activity authors are kept as history
 * (the UI renders unknown authors as former members).
 */
export function remapContent(
  content: Content,
  fromUserId: string | undefined,
  callerId: Id<"users">,
  memberIds: ReadonlySet<string>,
): Content {
  const map = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : id === fromUserId ? callerId : memberIds.has(id) ? id : undefined;
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
      comments: t.comments.map((c) => ({ ...c, authorId: c.authorId === fromUserId ? callerId : c.authorId })),
      activity: t.activity.map((a) => ({ ...a, authorId: a.authorId === fromUserId ? callerId : a.authorId })),
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
}

async function insertContent(ctx: MutationCtx, workspaceId: Id<"workspaces">, content: Content) {
  for (const l of content.labels) await ctx.db.insert("labels", { ...l, workspaceId });
  for (const p of content.projects) await ctx.db.insert("projects", { ...p, workspaceId });
  for (const t of content.tasks) await ctx.db.insert("tasks", { ...t, workspaceId });
  for (const p of content.posts) await ctx.db.insert("posts", { ...p, workspaceId });
}

async function deleteContent(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  for (const table of ["labels", "projects", "tasks", "posts"] as const) {
    for (const d of await loadDocs(ctx, table, workspaceId, "all")) await ctx.db.delete(d._id);
  }
  const trash = await ctx.db
    .query("trash")
    .withIndex("by_workspace_kind_id", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const d of trash) await ctx.db.delete(d._id);
}

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
    await deleteContent(ctx, workspaceId);
    await insertContent(
      ctx,
      workspaceId,
      remapContent(content, fromUserId, member.userId, new Set(members.map((m) => m.userId as string))),
    );
  },
});

export const deleteWorkspace = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    requireOwner(await requireMember(ctx, workspaceId));
    await deleteContent(ctx, workspaceId);
    for (const m of await ctx.db.query("members").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) {
      await ctx.db.delete(m._id);
    }
    for (const i of await ctx.db.query("invites").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) {
      await ctx.db.delete(i._id);
    }
    await ctx.db.delete(workspaceId);
  },
});

/** Called by crons.ts: drop trash older than TRASH_TTL_DAYS. */
export const purgeTrash = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const stale = await ctx.db
      .query("trash")
      .withIndex("by_deletedAt", (q) => q.lt("deletedAt", cutoff))
      .take(500);
    for (const d of stale) await ctx.db.delete(d._id);
    return stale.length;
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
