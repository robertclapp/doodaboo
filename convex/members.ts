import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  fail,
  findMembership,
  loadMembers,
  loadState,
  nowIso,
  randomToken,
  requireMember,
  requireOwner,
  requireUserId,
  toUser,
  writeDiff,
} from "./lib";
import { removeUser } from "../src/lib/mutations";

const INVITE_TTL_DAYS = 7;
const HANDLE = /^[a-z0-9_]{2,24}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

/** Members of a workspace, for the Team page. */
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await requireMember(ctx, workspaceId);
    const { members } = await loadMembers(ctx, workspaceId);
    const out = [];
    for (const m of members) {
      const u = await ctx.db.get(m.userId);
      if (!u) continue;
      out.push({ ...toUser(u), role: m.role, title: u.title, joinedAt: m.joinedAt });
    }
    return out;
  },
});

/**
 * Create an invite link. Whoever opens it while signed in joins the
 * workspace; the token, not the email, is what grants access (password
 * accounts never prove they own their address). Owners only.
 */
export const invite = mutation({
  args: { workspaceId: v.id("workspaces"), email: v.optional(v.string()) },
  handler: async (ctx, { workspaceId, email }) => {
    const member = await requireMember(ctx, workspaceId);
    requireOwner(member);
    const token = randomToken();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.parse(createdAt) + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const cleanEmail = email?.trim().toLowerCase().slice(0, 254) || undefined;
    await ctx.db.insert("invites", {
      workspaceId,
      token,
      email: cleanEmail,
      invitedBy: member.userId,
      createdAt,
      expiresAt,
    });
    return { token, expiresAt };
  },
});

/** Pending invites, with their tokens, so an owner can copy a link again. */
export const listInvites = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const member = await requireMember(ctx, workspaceId);
    requireOwner(member);
    const now = nowIso();
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return invites
      .filter((i) => !i.acceptedBy && i.expiresAt > now)
      .map((i) => ({ id: i._id, token: i.token, email: i.email, createdAt: i.createdAt, expiresAt: i.expiresAt }));
  },
});

export const revokeInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    const invite = await ctx.db.get(inviteId);
    if (!invite) return;
    requireOwner(await requireMember(ctx, invite.workspaceId));
    await ctx.db.delete(inviteId);
  },
});

/** What an invite link points at, so the join page can show the workspace name. */
export const peekInvite = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireUserId(ctx);
    const invite = await ctx.db.query("invites").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (!invite || invite.acceptedBy || invite.expiresAt <= nowIso()) return null;
    const workspace = await ctx.db.get(invite.workspaceId);
    return workspace ? { workspaceId: workspace._id, name: workspace.name } : null;
  },
});

/** Redeem an invite for the caller. Single use, expiring. */
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await requireUserId(ctx);
    const invite = await ctx.db.query("invites").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (!invite || invite.acceptedBy) fail("NotFound", "This invite link is no longer valid");
    const now = nowIso();
    if (invite.expiresAt <= now) fail("NotFound", "This invite link has expired");
    const workspace = await ctx.db.get(invite.workspaceId);
    if (!workspace) fail("NotFound", "That workspace no longer exists");
    if (!(await findMembership(ctx, invite.workspaceId, userId))) {
      await ctx.db.insert("members", { workspaceId: invite.workspaceId, userId, role: "member", joinedAt: now });
    }
    await ctx.db.patch(invite._id, { acceptedBy: userId, acceptedAt: now });
    return invite.workspaceId;
  },
});

/** Drop a member and clear their assignments (lead / member / assignee). */
async function dropMember(ctx: Parameters<typeof removeUserCascade>[0], workspaceId: Id<"workspaces">, userId: Id<"users">) {
  const membership = await findMembership(ctx, workspaceId, userId);
  if (membership) await ctx.db.delete(membership._id);
  await removeUserCascade(ctx, workspaceId, userId);
}

async function removeUserCascade(
  ctx: Parameters<typeof writeDiff>[0],
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
) {
  const { state, docs } = await loadState(ctx, workspaceId, userId, {
    labels: "none",
    projects: "all",
    tasks: "all",
    posts: "none",
  });
  const next = removeUser(state, userId);
  await writeDiff(ctx, "projects", workspaceId, docs.projects, next.projects);
  await writeDiff(ctx, "tasks", workspaceId, docs.tasks, next.tasks);
}

export const removeMember = mutation({
  args: { workspaceId: v.id("workspaces"), userId: v.id("users") },
  handler: async (ctx, { workspaceId, userId }) => {
    const member = await requireMember(ctx, workspaceId);
    requireOwner(member);
    if (userId === member.userId) fail("Validation", "Use “Leave workspace” to remove yourself");
    const target = await findMembership(ctx, workspaceId, userId);
    if (!target) fail("NotFound", "That person is not a member");
    if (target.role === "owner") fail("Forbidden", "Transfer ownership before removing an owner");
    await dropMember(ctx, workspaceId, userId);
  },
});

export const leave = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const member = await requireMember(ctx, workspaceId);
    if (member.role === "owner") {
      const { members } = await loadMembers(ctx, workspaceId);
      const owners = members.filter((m) => m.role === "owner");
      if (owners.length === 1) fail("Validation", "Transfer ownership (or delete the workspace) before leaving");
    }
    await dropMember(ctx, workspaceId, member.userId);
  },
});

export const transferOwnership = mutation({
  args: { workspaceId: v.id("workspaces"), toUserId: v.id("users") },
  handler: async (ctx, { workspaceId, toUserId }) => {
    const member = await requireMember(ctx, workspaceId);
    requireOwner(member);
    if (toUserId === member.userId) return;
    const target = await findMembership(ctx, workspaceId, toUserId);
    if (!target) fail("NotFound", "That person is not a member");
    await ctx.db.patch(target._id, { role: "owner" });
    await ctx.db.patch(member.doc._id, { role: "member" });
  },
});

/** The caller's own display fields. There is no way to edit anyone else's. */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    handle: v.optional(v.string()),
    color: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { name, handle, color, title }) => {
    const userId = await requireUserId(ctx);
    const patch: { name?: string; handle?: string; color?: string; title?: string } = {};
    if (name !== undefined) {
      const clean = name.trim().slice(0, 80);
      if (!clean) fail("Validation", "Name is required");
      patch.name = clean;
    }
    if (handle !== undefined) {
      const clean = handle.trim().replace(/^@/, "").toLowerCase();
      if (!HANDLE.test(clean)) fail("Validation", "Handle: 2-24 letters, digits or underscores");
      patch.handle = clean;
    }
    if (color !== undefined) {
      if (!COLOR.test(color)) fail("Validation", "Color must be a hex value like #ff5c1a");
      patch.color = color.toLowerCase();
    }
    if (title !== undefined) patch.title = title.trim().slice(0, 60) || undefined;
    await ctx.db.patch(userId, patch);
  },
});
