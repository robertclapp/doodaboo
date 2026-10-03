import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { labelDoc, postDoc, projectDoc, taskDoc } from "./validators";

/**
 * Cloud data model.
 *
 * Every workspace record keeps the app-generated string id it has in local
 * mode (`p_…`, `t_…`, `po_…`, `l_…`) in an `id` field, so routes, exports,
 * the CLI, and every `find((x) => x.id === …)` in the UI work unchanged;
 * Convex's own `_id` is internal. Comments, activity, and snapshots stay
 * embedded exactly as in src/lib/types.ts, which is what lets the pure
 * mutation layer run unmodified on the server (see src/lib/ops.ts).
 *
 * Authorization is membership: every function that touches a workspace
 * re-reads `members` for the caller, so removing someone takes effect on
 * their next call regardless of token lifetime. `members.role` is the single
 * source of truth for ownership — never mirror it into the JWT.
 */
export default defineSchema({
  ...authTables,
  // Convex Auth's users table, extended with the app's display fields.
  // `title` is the free-text job title shown on the Team page (app `User.role`);
  // it is deliberately not called `role` so nobody confuses it with
  // `members.role`, which is what authorization reads.
  users: defineTable({
    ...authTables.users.validator.fields,
    handle: v.optional(v.string()),
    color: v.optional(v.string()),
    title: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  workspaces: defineTable({
    name: v.string(),
    createdBy: v.id("users"),
    createdAt: v.string(),
  }),

  members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("member")),
    joinedAt: v.string(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),

  // Capability-token invites. The token is the credential: whoever presents
  // it (signed in) joins. Email is informational only — password accounts
  // never prove mailbox control, so it must not be what grants access.
  invites: defineTable({
    workspaceId: v.id("workspaces"),
    token: v.string(),
    email: v.optional(v.string()),
    invitedBy: v.id("users"),
    createdAt: v.string(),
    expiresAt: v.string(),
    acceptedBy: v.optional(v.id("users")),
    acceptedAt: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_workspace", ["workspaceId"]),

  labels: defineTable({ workspaceId: v.id("workspaces"), ...labelDoc })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_id", ["workspaceId", "id"]),

  projects: defineTable({ workspaceId: v.id("workspaces"), ...projectDoc })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_id", ["workspaceId", "id"]),

  tasks: defineTable({ workspaceId: v.id("workspaces"), ...taskDoc })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_id", ["workspaceId", "id"])
    .index("by_workspace_project", ["workspaceId", "projectId"]),

  posts: defineTable({ workspaceId: v.id("workspaces"), ...postDoc })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_id", ["workspaceId", "id"]),

  // Deleted records, kept so "Undo" restores the server's copy rather than
  // a client-supplied one (which could carry forged comment authors).
  // Purged by crons.ts after TRASH_TTL_DAYS.
  trash: defineTable({
    workspaceId: v.id("workspaces"),
    kind: v.union(v.literal("project"), v.literal("task"), v.literal("post")),
    id: v.string(),
    snapshot: v.any(),
    deletedAt: v.string(),
    deletedBy: v.id("users"),
  })
    .index("by_workspace_kind_id", ["workspaceId", "kind", "id"])
    .index("by_deletedAt", ["deletedAt"]),
});
