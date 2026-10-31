import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { WorkspaceState } from "../src/lib/mutations";
import type { CollectionScope, OpScope } from "../src/lib/ops";
import type { Label, Post, Project, Task, User } from "../src/lib/types";
import { getDocumentSize } from "convex/values";
import { checkRecord, type RecordKind } from "../src/lib/limits";

/**
 * Shared helpers for the workspace functions: who is calling, what they may
 * do, how stored documents map to the app's records, and how a replayed
 * state is written back as a minimal diff.
 */

export type Ctx = QueryCtx | MutationCtx;

export type ErrorCode =
  | "Unauthenticated"
  | "Forbidden"
  | "NotFound"
  | "Validation"
  | "Conflict";

export function fail(code: ErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}

export async function requireUserId(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) fail("Unauthenticated", "Sign in first");
  return userId;
}

export interface Membership {
  userId: Id<"users">;
  role: "owner" | "member";
  doc: Doc<"members">;
}

export async function findMembership(
  ctx: Ctx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
): Promise<Doc<"members"> | null> {
  return ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .unique();
}

/** Every workspace-scoped function starts here. */
export async function requireMember(ctx: Ctx, workspaceId: Id<"workspaces">): Promise<Membership> {
  const userId = await requireUserId(ctx);
  const doc = await findMembership(ctx, workspaceId, userId);
  if (!doc) fail("Forbidden", "You are not a member of this workspace");
  return { userId, role: doc.role, doc };
}

export function requireOwner(m: Membership): void {
  if (m.role !== "owner") fail("Forbidden", "Only a workspace owner can do that");
}

// ── Users ───────────────────────────────────────────────────────────────────

const PALETTE = ["#ff5c1a", "#3b4ae4", "#16a34a", "#6b4ee4", "#dc2626", "#eab308", "#0a0a0a", "#c4f000"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function defaultHandle(doc: Pick<Doc<"users">, "email" | "name" | "_id">): string {
  const base = (doc.email?.split("@")[0] ?? doc.name ?? "member")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
  return base || `u${hash(doc._id).toString(36).slice(0, 6)}`;
}

/** Map a Convex user document to the app's `User` record. Never exposes the email. */
export function toUser(doc: Doc<"users">): User {
  return {
    id: doc._id,
    name: doc.name?.trim() || doc.email?.split("@")[0] || "Member",
    handle: doc.handle ?? defaultHandle(doc),
    color: doc.color ?? PALETTE[hash(doc._id) % PALETTE.length],
    role: doc.title,
  };
}

export async function loadMembers(
  ctx: Ctx,
  workspaceId: Id<"workspaces">,
): Promise<{ members: Doc<"members">[]; users: User[] }> {
  const members = await ctx.db
    .query("members")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  const users: User[] = [];
  for (const m of members) {
    const u = await ctx.db.get(m.userId);
    if (u) users.push(toUser(u));
  }
  return { members, users };
}

// ── Documents ↔ records ─────────────────────────────────────────────────────

type Table = "labels" | "projects" | "tasks" | "posts";
type RecordOf<T extends Table> = T extends "labels"
  ? Label
  : T extends "projects"
    ? Project
    : T extends "tasks"
      ? Task
      : Post;

/** Drop Convex's system fields and the tenant key; what is left is the app record. */
export function toRecord<T extends Table>(doc: Doc<T>): RecordOf<T> {
  const { _id: _i, _creationTime: _c, workspaceId: _w, ...rest } = doc as Doc<T> & {
    workspaceId: Id<"workspaces">;
  };
  return rest as unknown as RecordOf<T>;
}

const byCreatedAtDesc = <R extends { createdAt: string }>(a: R, b: R) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;

/**
 * Load one collection according to an op's read scope. Insertion order is
 * ascending `_creationTime`; the pure mutations prepend new records, so the
 * assembled arrays are sorted newest-first by `createdAt` to match local
 * mode (and a restored record returns to its original position).
 *
 * The per-table switches keep Convex's index typing precise; a table name
 * that is a union loses the field types of `q.eq`.
 */
async function allOf<T extends Table>(ctx: Ctx, table: T, workspaceId: Id<"workspaces">): Promise<Doc<T>[]> {
  switch (table) {
    case "labels":
      return (await ctx.db.query("labels").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) as unknown as Doc<T>[];
    case "projects":
      return (await ctx.db.query("projects").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) as unknown as Doc<T>[];
    case "tasks":
      return (await ctx.db.query("tasks").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) as unknown as Doc<T>[];
    default:
      return (await ctx.db.query("posts").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()) as unknown as Doc<T>[];
  }
}

export async function findByAppId<T extends Table>(
  ctx: Ctx,
  table: T,
  workspaceId: Id<"workspaces">,
  id: string,
): Promise<Doc<T> | null> {
  switch (table) {
    case "labels":
      return (await ctx.db.query("labels").withIndex("by_workspace_id", (q) => q.eq("workspaceId", workspaceId).eq("id", id)).unique()) as unknown as Doc<T> | null;
    case "projects":
      return (await ctx.db.query("projects").withIndex("by_workspace_id", (q) => q.eq("workspaceId", workspaceId).eq("id", id)).unique()) as unknown as Doc<T> | null;
    case "tasks":
      return (await ctx.db.query("tasks").withIndex("by_workspace_id", (q) => q.eq("workspaceId", workspaceId).eq("id", id)).unique()) as unknown as Doc<T> | null;
    default:
      return (await ctx.db.query("posts").withIndex("by_workspace_id", (q) => q.eq("workspaceId", workspaceId).eq("id", id)).unique()) as unknown as Doc<T> | null;
  }
}

export async function loadDocs<T extends Table>(
  ctx: Ctx,
  table: T,
  workspaceId: Id<"workspaces">,
  scope: CollectionScope,
): Promise<Doc<T>[]> {
  if (scope === "none") return [];
  if (scope === "all") return allOf(ctx, table, workspaceId);
  if ("id" in scope) {
    const doc = await findByAppId(ctx, table, workspaceId, scope.id);
    return doc ? [doc] : [];
  }
  if (table !== "tasks") fail("Validation", `projectId scope is only valid for tasks`);
  return (await ctx.db
    .query("tasks")
    .withIndex("by_workspace_project", (q) =>
      q.eq("workspaceId", workspaceId).eq("projectId", scope.projectId),
    )
    .collect()) as unknown as Doc<T>[];
}

export interface Loaded {
  state: WorkspaceState;
  docs: {
    labels: Doc<"labels">[];
    projects: Doc<"projects">[];
    tasks: Doc<"tasks">[];
    posts: Doc<"posts">[];
  };
}

export const FULL_SCOPE: OpScope = { labels: "all", projects: "all", tasks: "all", posts: "all" };

/** Assemble a (possibly partial) WorkspaceState for the caller. */
export async function loadState(
  ctx: Ctx,
  workspaceId: Id<"workspaces">,
  currentUserId: Id<"users">,
  scope: OpScope,
): Promise<Loaded> {
  const [{ users }, labels, projects, tasks, posts] = await Promise.all([
    loadMembers(ctx, workspaceId),
    loadDocs(ctx, "labels", workspaceId, scope.labels),
    loadDocs(ctx, "projects", workspaceId, scope.projects),
    loadDocs(ctx, "tasks", workspaceId, scope.tasks),
    loadDocs(ctx, "posts", workspaceId, scope.posts),
  ]);
  return {
    docs: { labels, projects, tasks, posts },
    state: {
      version: 1,
      // Theme is a device preference; the client overlays its own.
      theme: "system",
      currentUserId,
      users,
      labels: labels.map((d) => toRecord(d) as Label),
      projects: projects.map((d) => toRecord(d) as Project).sort(byCreatedAtDesc),
      tasks: tasks.map((d) => toRecord(d) as Task).sort(byCreatedAtDesc),
      posts: posts.map((d) => toRecord(d) as Post).sort(byCreatedAtDesc),
    },
  };
}

// ── Budgeted read model ─────────────────────────────────────────────────────

/**
 * Convex fails a function that reads more than 16 MiB or 32,000 documents.
 * `workspace.get` reads the whole workspace, so it reads against a budget
 * well inside both and, if a workspace ever outgrows it, returns what fits —
 * newest records first — and names the collections it had to cut, instead
 * of failing for every member. The headroom covers the membership, user and
 * workspace documents read alongside, and the one document read past the
 * budget before a scan stops (records are capped at LIMITS.recordBytes).
 */
export const READ_BUDGET_BYTES = 12 * 1024 * 1024;
export const READ_BUDGET_DOCS = 24_000;
/** Posts may use at most this share of what is left after labels and projects, so issues always get room. */
const POSTS_SHARE = 0.35;

function scanQuery<T extends Table>(ctx: Ctx, table: T, workspaceId: Id<"workspaces">): AsyncIterable<Doc<T>> {
  switch (table) {
    case "labels":
      return ctx.db.query("labels").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc") as unknown as AsyncIterable<Doc<T>>;
    case "projects":
      return ctx.db.query("projects").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc") as unknown as AsyncIterable<Doc<T>>;
    case "tasks":
      return ctx.db.query("tasks").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc") as unknown as AsyncIterable<Doc<T>>;
    default:
      return ctx.db.query("posts").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc") as unknown as AsyncIterable<Doc<T>>;
  }
}

async function scan<T extends Table>(
  ctx: Ctx,
  table: T,
  workspaceId: Id<"workspaces">,
  budget: { bytes: number; docs: number },
  maxBytes: number,
): Promise<{ docs: Doc<T>[]; truncated: boolean }> {
  const docs: Doc<T>[] = [];
  let used = 0;
  let truncated = false;
  for await (const doc of scanQuery(ctx, table, workspaceId)) {
    const size = getDocumentSize(doc as never);
    if (used + size > maxBytes || budget.docs <= 0) {
      truncated = true;
      break;
    }
    used += size;
    budget.docs--;
    docs.push(doc);
  }
  budget.bytes -= used;
  return { docs, truncated };
}

export async function loadViewBudgeted(
  ctx: Ctx,
  workspaceId: Id<"workspaces">,
  currentUserId: Id<"users">,
  limits: { bytes: number; docs: number } = { bytes: READ_BUDGET_BYTES, docs: READ_BUDGET_DOCS },
): Promise<{ state: WorkspaceState; truncated: RecordKind[] }> {
  const budget = { ...limits };
  const { users } = await loadMembers(ctx, workspaceId);
  const labels = await scan(ctx, "labels", workspaceId, budget, budget.bytes);
  const projects = await scan(ctx, "projects", workspaceId, budget, budget.bytes);
  const posts = await scan(ctx, "posts", workspaceId, budget, Math.floor(budget.bytes * POSTS_SHARE));
  const tasks = await scan(ctx, "tasks", workspaceId, budget, budget.bytes);
  const truncated: RecordKind[] = [];
  if (labels.truncated) truncated.push("labels");
  if (projects.truncated) truncated.push("projects");
  if (tasks.truncated) truncated.push("tasks");
  if (posts.truncated) truncated.push("posts");
  return {
    truncated,
    state: {
      version: 1,
      theme: "system",
      currentUserId,
      users,
      // Scanned newest-first so a cut keeps the newest; shown in insertion
      // order, which is what addLabel (append) and local mode use.
      labels: labels.docs.map((d) => toRecord(d) as Label).reverse(),
      projects: projects.docs.map((d) => toRecord(d) as Project).sort(byCreatedAtDesc),
      tasks: tasks.docs.map((d) => toRecord(d) as Task).sort(byCreatedAtDesc),
      posts: posts.docs.map((d) => toRecord(d) as Post).sort(byCreatedAtDesc),
    },
  };
}

// ── Diff writer ─────────────────────────────────────────────────────────────

/**
 * Structural equality that treats an `undefined` property as absent (Convex
 * strips them) but keeps `null` distinct, as Convex does.
 */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => same(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    if (ao[k] === undefined && bo[k] === undefined) continue;
    if (!same(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Activity is system-generated history, so it is trimmed rather than
 * refused: keep the newest entries. ~100 bytes each, so the cap keeps a
 * task well inside LIMITS.recordBytes (src/lib/limits.ts) on its own.
 */
export const ACTIVITY_CAP = 1000;

function bounded<T extends Table>(table: T, record: RecordOf<T>): RecordOf<T> {
  if (table === "tasks") {
    const t = record as unknown as Task;
    if (t.activity.length > ACTIVITY_CAP) {
      return { ...t, activity: t.activity.slice(-ACTIVITY_CAP) } as unknown as RecordOf<T>;
    }
  }
  return record;
}

/**
 * Persist `next` (the replayed collection) against `prev` (what was loaded):
 * insert new ids, replace changed records, delete the ones that vanished.
 * Every record written must satisfy the cloud size limits
 * (src/lib/limits.ts); unchanged records are not re-checked. `restoring`
 * names the ids a restore op is bringing back from the trash; every other
 * insert must use an id the trash does not hold.
 * Only the loaded slice is compared, so an op scoped to one task can never
 * delete the others. Inserts check the whole table for an id collision —
 * the seed's ids come from the client.
 */
const TRASH_KIND = { projects: "project", tasks: "task", posts: "post" } as const;

/** The trash row holding a deleted record with this id, if any. */
export async function trashRow(
  ctx: Ctx,
  workspaceId: Id<"workspaces">,
  kind: "project" | "task" | "post",
  id: string,
): Promise<Doc<"trash"> | null> {
  return ctx.db
    .query("trash")
    .withIndex("by_workspace_kind_id", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind).eq("id", id))
    .first();
}

export async function writeDiff<T extends Table>(
  ctx: MutationCtx,
  table: T,
  workspaceId: Id<"workspaces">,
  prev: Doc<T>[],
  next: RecordOf<T>[],
  opts: { restoring?: ReadonlySet<string> } = {},
): Promise<{ inserted: number; replaced: number; deleted: number }> {
  const appId = (d: Doc<T>) => (d as unknown as { id: string }).id;
  const prevById = new Map(prev.map((d) => [appId(d), d]));
  const nextIds = new Set<string>();
  let inserted = 0;
  let replaced = 0;
  let deleted = 0;
  for (const raw of next) {
    const record = bounded(table, raw);
    const id = (record as { id: string }).id;
    if (nextIds.has(id)) fail("Validation", `Duplicate ${table} id ${id}`);
    nextIds.add(id);
    const existing = prevById.get(id);
    if (existing) {
      if (!same(toRecord(existing), record)) {
        const problem = checkRecord(table, record as Label | Project | Task | Post);
        if (problem) fail("Validation", problem);
        await ctx.db.replace(existing._id, { ...record, workspaceId } as never);
        replaced++;
      }
      continue;
    }
    const problem = checkRecord(table, record as Label | Project | Task | Post);
    if (problem) fail("Validation", problem);
    // Ids a restore brings back are known to be free: they were reserved by
    // their trash rows the whole time they were deleted (and the restore op
    // checks its own id up front). Skipping the per-record lookups keeps a
    // project restore at a constant number of queries however many issues
    // it holds — Convex allows 4,096 per transaction.
    if (!opts.restoring?.has(id)) {
      const clash = await findByAppId(ctx, table, workspaceId, id);
      if (clash) fail("Conflict", `A ${table.slice(0, -1)} with id ${id} already exists`);
      // A deleted record's id stays reserved while it can still be restored;
      // otherwise a new record could take it and turn the next Undo into a
      // silent no-op that also discards the snapshot.
      if (table !== "labels") {
        const reserved = await trashRow(ctx, workspaceId, TRASH_KIND[table as "projects" | "tasks" | "posts"], id);
        if (reserved) fail("Conflict", `The id ${id} belongs to a deleted ${table.slice(0, -1)} that can still be restored`);
      }
    }
    await ctx.db.insert(table, { ...record, workspaceId } as never);
    inserted++;
  }
  for (const d of prev) {
    if (!nextIds.has(appId(d))) {
      await ctx.db.delete(d._id);
      deleted++;
    }
  }
  return { inserted, replaced, deleted };
}

export const nowIso = () => new Date().toISOString();

/** A URL-safe random token for invites. */
export function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
