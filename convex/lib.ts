import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { WorkspaceState } from "../src/lib/mutations";
import type { CollectionScope, OpScope } from "../src/lib/ops";
import type { Label, Post, Project, Task, User } from "../src/lib/types";

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

// ── Diff writer ─────────────────────────────────────────────────────────────

/** Structural equality that treats an `undefined` property as absent (Convex strips them). */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a == null && b == null;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => same(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!same(ao[k], bo[k])) return false;
  return true;
}

/** Embedded histories are unbounded arrays; keep the newest entries under the cap. */
export const ACTIVITY_CAP = 4000;

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
 * Only the loaded slice is compared, so an op scoped to one task can never
 * delete the others. Inserts check the whole table for an id collision —
 * the seed's ids come from the client.
 */
export async function writeDiff<T extends Table>(
  ctx: MutationCtx,
  table: T,
  workspaceId: Id<"workspaces">,
  prev: Doc<T>[],
  next: RecordOf<T>[],
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
        await ctx.db.replace(existing._id, { ...record, workspaceId } as never);
        replaced++;
      }
      continue;
    }
    const clash = await findByAppId(ctx, table, workspaceId, id);
    if (clash) fail("Conflict", `A ${table.slice(0, -1)} with id ${id} already exists`);
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
