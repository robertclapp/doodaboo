import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
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
    expect(await as(t, bob).query(api.members.peekInvite, { token })).toBeNull();

    const list = await as(t, owner).query(api.members.list, { workspaceId: ws });
    expect(list.map((m) => [m.id, m.role]).sort()).toEqual([[owner.userId, "owner"], [bob.userId, "member"]].sort());
    expect(await as(t, owner).query(api.members.listInvites, { workspaceId: ws })).toEqual([]);
    expect(await errorCode(as(t, bob).query(api.members.listInvites, { workspaceId: ws }))).toBe("Forbidden");
  });

  it("revoke removes a pending invite", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const ws = await workspaceFor(t, owner);
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    const [pending] = await as(t, owner).query(api.members.listInvites, { workspaceId: ws });
    expect(pending.token).toBe(token);
    await as(t, owner).mutation(api.members.revokeInvite, { inviteId: pending.id });
    expect(await as(t, owner).query(api.members.listInvites, { workspaceId: ws })).toEqual([]);
    const other = await signUp(t, "other@example.com");
    expect(await errorCode(as(t, other).mutation(api.members.acceptInvite, { token }))).toBe("NotFound");
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
    expect(await errorCode(as(t, owner).mutation(api.members.invite, { workspaceId: ws }))).toBe("Forbidden");
    expect(
      await errorCode(
        as(t, owner).mutation(api.workspace.apply, { workspaceId: ws, op: { type: "deleteProject", id: project.id }, seed: seed() }),
      ),
    ).toBe("Forbidden");
    await as(t, member).mutation(api.members.leave, { workspaceId: ws }).catch(() => undefined);
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
