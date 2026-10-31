import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import { MAX_PENDING_INVITES } from "./members";
import { as, fresh, seed, signUp, workspaceFor } from "./test.helpers";
import type { WorkspaceView } from "./workspace";
import type { Project, Task } from "../src/lib/types";

const errorCode = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "none";
  } catch (e) {
    if (e instanceof ConvexError) return (e.data as { code: string }).code;
    throw e;
  }
};

describe("sign-up hardening", () => {
  it("normalizes the email and derives a default name and handle", async () => {
    const t = fresh();
    const me = await signUp(t, "  Ada.Lovelace@Example.COM ");
    const profile = await as(t, me).query(api.users.me, {});
    expect(profile).toMatchObject({ id: me.userId, email: "ada.lovelace@example.com", name: "ada.lovelace", handle: "adalovelace" });
  });

  it("refuses sign-up for an existing account without acting as a password oracle", async () => {
    const t = fresh();
    await signUp(t, "taken@example.com", "correct horse battery");
    for (const password of ["correct horse battery", "wrong guess entirely"]) {
      await expect(
        t.action(api.auth.signIn, { provider: "password", params: { flow: "signUp", email: "Taken@example.com", password } }),
      ).rejects.toThrow(/Could not sign up/);
    }
  });

  it("enforces the password policy and the email shape", async () => {
    const t = fresh();
    await expect(
      t.action(api.auth.signIn, { provider: "password", params: { flow: "signUp", email: "x@example.com", password: "short" } }),
    ).rejects.toThrow(/12-128/);
    await expect(
      t.action(api.auth.signIn, { provider: "password", params: { flow: "signUp", email: "not an email", password: "correct horse battery" } }),
    ).rejects.toThrow(/valid email/);
  });

  it("a wrong password and an unknown email get the same readable error", async () => {
    const t = fresh();
    await signUp(t, "real@example.com", "correct horse battery");
    const attempt = async (email: string, password: string) => {
      try {
        await t.action(api.auth.signIn, { provider: "password", params: { flow: "signIn", email, password } });
        return "signed in";
      } catch (e) {
        // A ConvexError's data survives production redaction; a plain Error does not.
        expect(e).toBeInstanceOf(ConvexError);
        return (e as ConvexError<string>).data;
      }
    };
    expect(await attempt("real@example.com", "wrong password here")).toBe("Wrong email or password");
    expect(await attempt("nobody@example.com", "whatever password")).toBe("Wrong email or password");
  });

  it("signs in with any casing of the email", async () => {
    const t = fresh();
    await signUp(t, "case@example.com", "correct horse battery");
    const res = (await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signIn", email: "CASE@EXAMPLE.COM", password: "correct horse battery" },
    })) as { tokens?: { token: string } | null };
    expect(res.tokens?.token).toBeTruthy();
  });
});

describe("invites", () => {
  it("a token joins whoever presents it, once, until it expires", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const alice = await signUp(t, "alice@example.com");
    const bob = await signUp(t, "bob@example.com");
    const ws = await workspaceFor(t, owner);

    expect(await errorCode(as(t, alice).mutation(api.members.invite, { workspaceId: ws }))).toBe("Forbidden");
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws, email: "Alice@Example.com" })) as {
      token: string;
    };
    expect(token.length).toBeGreaterThanOrEqual(30);

    const peek = await as(t, bob).query(api.members.peekInvite, { token });
    expect(peek).toMatchObject({ workspaceId: ws, name: "Test workspace" });

    // The email on the invite is informational: Bob can use Alice's link.
    expect(await as(t, bob).mutation(api.members.acceptInvite, { token })).toBe(ws);
    expect(await errorCode(as(t, alice).mutation(api.members.acceptInvite, { token }))).toBe("NotFound");
    // Used up: nobody else can see it; Bob, who used it, is shown his workspace.
    expect(await as(t, alice).query(api.members.peekInvite, { token })).toBeNull();
    expect(await as(t, bob).query(api.members.peekInvite, { token })).toMatchObject({ alreadyMember: true });

    const list = await as(t, owner).query(api.members.list, { workspaceId: ws });
    expect(list!.map((m) => [m.id, m.role]).sort()).toEqual([[owner.userId, "owner"], [bob.userId, "member"]].sort());
    expect(await as(t, owner).query(api.members.listInvites, { workspaceId: ws })).toEqual([]);
    // Non-owners get null rather than an error, so a page that is still
    // subscribed after a role change renders instead of crashing.
    expect(await as(t, bob).query(api.members.listInvites, { workspaceId: ws })).toBeNull();
    expect(await as(t, alice).query(api.members.list, { workspaceId: ws })).toBeNull();
  });

  it("revoke removes a pending invite", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const ws = await workspaceFor(t, owner);
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    const [pending] = (await as(t, owner).query(api.members.listInvites, { workspaceId: ws }))!;
    expect(pending.token).toBe(token);
    expect(pending.invitedBy).toBe("owner");
    await as(t, owner).mutation(api.members.revokeInvite, { inviteId: pending.id });
    expect(await as(t, owner).query(api.members.listInvites, { workspaceId: ws })).toEqual([]);
    const other = await signUp(t, "other@example.com");
    expect(await errorCode(as(t, other).mutation(api.members.acceptInvite, { token }))).toBe("NotFound");
  });

  it("expired links can be neither peeked nor redeemed", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const ws = await workspaceFor(t, owner);
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    await t.run(async (ctx) => {
      const invite = await ctx.db.query("invites").withIndex("by_token", (q) => q.eq("token", token)).unique();
      await ctx.db.patch(invite!._id, { expiresAt: "2020-01-01T00:00:00.000Z" });
    });
    const late = await signUp(t, "late@example.com");
    expect(await as(t, late).query(api.members.peekInvite, { token })).toBeNull();
    expect(await errorCode(as(t, late).mutation(api.members.acceptInvite, { token }))).toBe("NotFound");
  });

  it("an existing member opening a link does not use it up", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const friend = await signUp(t, "friend@example.com");
    const ws = await workspaceFor(t, owner);
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    expect(await as(t, owner).query(api.members.peekInvite, { token })).toMatchObject({ alreadyMember: true });
    expect(await as(t, owner).mutation(api.members.acceptInvite, { token })).toBe(ws);
    // Still pending, and still works for the person it was meant for.
    expect(await as(t, owner).query(api.members.listInvites, { workspaceId: ws })).toHaveLength(1);
    expect(await as(t, friend).query(api.members.peekInvite, { token })).toMatchObject({ alreadyMember: false });
    expect(await as(t, friend).mutation(api.members.acceptInvite, { token })).toBe(ws);
  });

  it("links die with their maker's ownership: transfer, removal and leaving revoke them", async () => {
    const t = fresh();
    const a = await signUp(t, "a@example.com");
    const b = await signUp(t, "b@example.com");
    const stranger = await signUp(t, "stranger@example.com");
    const ws = await workspaceFor(t, a);
    const first = (await as(t, a).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    await as(t, b).mutation(api.members.acceptInvite, { token: first.token });
    // A keeps a spare link, hands the workspace to B and is removed by B.
    const spare = (await as(t, a).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    await as(t, a).mutation(api.members.transferOwnership, { workspaceId: ws, toUserId: b.userId });
    expect(await as(t, b).query(api.members.listInvites, { workspaceId: ws })).toEqual([]);
    await as(t, b).mutation(api.members.removeMember, { workspaceId: ws, userId: a.userId });
    // Neither A nor anyone A gave the link to can get in with it.
    expect(await errorCode(as(t, a).mutation(api.members.acceptInvite, { token: spare.token }))).toBe("NotFound");
    expect(await errorCode(as(t, stranger).mutation(api.members.acceptInvite, { token: spare.token }))).toBe("NotFound");
    expect(await as(t, a).query(api.workspace.get, { workspaceId: ws })).toBeNull();
  });

  it("a link is refused once its maker is no longer an owner, even if the row survived", async () => {
    const t = fresh();
    const a = await signUp(t, "a@example.com");
    const b = await signUp(t, "b@example.com");
    const c = await signUp(t, "c@example.com");
    const ws = await workspaceFor(t, a);
    const { token } = (await as(t, a).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    // Demote A behind the API's back (as data written before the cleanup existed would be).
    await t.run(async (ctx) => {
      const m = await ctx.db
        .query("members")
        .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ws).eq("userId", a.userId))
        .unique();
      await ctx.db.patch(m!._id, { role: "member" });
      await ctx.db.insert("members", { workspaceId: ws, userId: b.userId, role: "owner", joinedAt: "2026-01-01T00:00:00.000Z" });
    });
    expect(await as(t, c).query(api.members.peekInvite, { token })).toBeNull();
    expect(await errorCode(as(t, c).mutation(api.members.acceptInvite, { token }))).toBe("NotFound");
    // And the new owner is not shown a link that would not work.
    expect(await as(t, b).query(api.members.listInvites, { workspaceId: ws })).toEqual([]);
  });

  it("the person who redeemed a link sees their workspace when they open it again", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const joiner = await signUp(t, "joiner@example.com");
    const ws = await workspaceFor(t, owner);
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    await as(t, joiner).mutation(api.members.acceptInvite, { token });
    expect(await as(t, joiner).query(api.members.peekInvite, { token })).toMatchObject({ workspaceId: ws, alreadyMember: true });
    const other = await signUp(t, "other@example.com");
    expect(await as(t, other).query(api.members.peekInvite, { token })).toBeNull();
  });

  it(`caps open invites at ${MAX_PENDING_INVITES} per workspace`, async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const ws = await workspaceFor(t, owner);
    for (let i = 0; i < MAX_PENDING_INVITES; i++) await as(t, owner).mutation(api.members.invite, { workspaceId: ws });
    expect(await errorCode(as(t, owner).mutation(api.members.invite, { workspaceId: ws }))).toBe("Validation");
  });

  it("purgeInvites deletes invites past their expiry, used or not, and keeps live ones", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const ws = await workspaceFor(t, owner);
    const old = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    const live = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    await t.run(async (ctx) => {
      const row = await ctx.db.query("invites").withIndex("by_token", (q) => q.eq("token", old.token)).unique();
      await ctx.db.patch(row!._id, { expiresAt: "2020-01-01T00:00:00.000Z", acceptedBy: owner.userId });
    });
    expect(await t.mutation(internal.members.purgeInvites, {})).toBe(1);
    const left = await t.run(async (ctx) => (await ctx.db.query("invites").collect()).map((i) => i.token));
    expect(left).toEqual([live.token]);
  });
});

describe("membership changes", () => {
  async function team() {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const member = await signUp(t, "member@example.com");
    const ws = await workspaceFor(t, owner);
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    await as(t, member).mutation(api.members.acceptInvite, { token });
    const project = (await as(t, owner).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createProject", data: { name: "Web", key: "WEB", leadId: member.userId, memberIds: [owner.userId, member.userId] } },
      seed: seed(),
    })) as Project;
    const task = (await as(t, owner).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createTask", data: { projectId: project.id, title: "x", assigneeId: member.userId } },
      seed: seed(),
    })) as Task;
    return { t, owner, member, ws, project, task };
  }

  it("removeMember clears the member's lead/assignee references and revokes access", async () => {
    const { t, owner, member, ws } = await team();
    expect(await errorCode(as(t, member).mutation(api.members.removeMember, { workspaceId: ws, userId: owner.userId }))).toBe("Forbidden");
    expect(await errorCode(as(t, owner).mutation(api.members.removeMember, { workspaceId: ws, userId: owner.userId }))).toBe("Validation");
    await as(t, owner).mutation(api.members.removeMember, { workspaceId: ws, userId: member.userId });
    const view = (await as(t, owner).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.users.map((u) => u.id)).toEqual([owner.userId]);
    expect(view.state.projects[0].leadId).toBeUndefined();
    expect(view.state.projects[0].memberIds).toEqual([owner.userId]);
    expect(view.state.tasks[0].assigneeId).toBeUndefined();
    expect(await as(t, member).query(api.workspace.get, { workspaceId: ws })).toBeNull();
  });

  it("leave: members may, the last owner may not", async () => {
    const { t, owner, member, ws } = await team();
    expect(await errorCode(as(t, owner).mutation(api.members.leave, { workspaceId: ws }))).toBe("Validation");
    await as(t, member).mutation(api.members.leave, { workspaceId: ws });
    expect(await as(t, member).query(api.workspace.listMine, {})).toEqual([]);
  });

  it("transferOwnership swaps roles; the old owner loses owner-only rights", async () => {
    const { t, owner, member, ws, project } = await team();
    expect(await errorCode(as(t, member).mutation(api.members.transferOwnership, { workspaceId: ws, toUserId: owner.userId }))).toBe("Forbidden");
    await as(t, owner).mutation(api.members.transferOwnership, { workspaceId: ws, toUserId: member.userId });
    // Demoted, not removed: still a member with read access.
    const roles = (await as(t, member).query(api.members.list, { workspaceId: ws }))!.map((m) => [m.id, m.role]);
    expect(roles.sort()).toEqual([[member.userId, "owner"], [owner.userId, "member"]].sort());
    expect(await as(t, owner).query(api.workspace.get, { workspaceId: ws })).toMatchObject({ role: "member" });
    expect(await errorCode(as(t, owner).mutation(api.members.invite, { workspaceId: ws }))).toBe("Forbidden");
    expect(
      await errorCode(
        as(t, owner).mutation(api.workspace.apply, { workspaceId: ws, op: { type: "deleteProject", id: project.id }, seed: seed() }),
      ),
    ).toBe("Forbidden");
    // The new owner is now the last owner and cannot leave.
    expect(await errorCode(as(t, member).mutation(api.members.leave, { workspaceId: ws }))).toBe("Validation");
  });

  it("updateProfile is self-only and validated", async () => {
    const { t, owner, member, ws } = await team();
    await as(t, member).mutation(api.members.updateProfile, { handle: "@Mem_Ber", color: "#ABCDEF", title: "QA", name: "Mem" });
    const view = (await as(t, owner).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.users.find((u) => u.id === member.userId)).toMatchObject({ handle: "mem_ber", color: "#abcdef", role: "QA", name: "Mem" });
    expect(await errorCode(as(t, member).mutation(api.members.updateProfile, { handle: "x" }))).toBe("Validation");
    expect(await errorCode(as(t, member).mutation(api.members.updateProfile, { color: "red" }))).toBe("Validation");
    // No argument names a target user, so cross-account edits are impossible by construction.
    await expect(
      as(t, member).mutation(api.members.updateProfile, { userId: owner.userId, name: "pwned" } as never),
    ).rejects.toThrow();
  });
});
