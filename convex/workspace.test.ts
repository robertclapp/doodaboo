import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { as, fresh, seed, signUp, workspaceFor } from "./test.helpers";
import type { WorkspaceView } from "./workspace";
import type { Task, Project, Post } from "../src/lib/types";
import { emptyWorkspace } from "../src/lib/mutations";
import { runOp, seededContext } from "../src/lib/ops";

const errorCode = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "none";
  } catch (e) {
    if (e instanceof ConvexError) return (e.data as { code: string }).code;
    throw e;
  }
};

describe("workspace lifecycle", () => {
  it("create → listMine → get returns an empty workspace with the caller as the only user", async () => {
    const t = fresh();
    const me = await signUp(t, "Owner@Example.com", "correct horse battery", "Owner One");
    const workspaceId = await workspaceFor(t, me, "  Acme  ");
    const mine = await as(t, me).query(api.workspace.listMine, {});
    expect(mine).toEqual([expect.objectContaining({ id: workspaceId, name: "Acme", role: "owner" })]);
    const view = (await as(t, me).query(api.workspace.get, { workspaceId })) as WorkspaceView;
    expect(view.role).toBe("owner");
    expect(view.state.currentUserId).toBe(me.userId);
    expect(view.state.users).toHaveLength(1);
    expect(view.state.users[0]).toMatchObject({ id: me.userId, name: "Owner One", handle: "owner" });
    expect(view.state.projects).toEqual([]);
    expect(view.state.theme).toBe("system");
    // The email never leaves users.me.
    expect(JSON.stringify(view)).not.toContain("owner@example.com");
  });

  it("get is null for a non-member and for an unknown workspace", async () => {
    const t = fresh();
    const a = await signUp(t, "a@example.com");
    const b = await signUp(t, "b@example.com");
    const ws = await workspaceFor(t, a);
    expect(await as(t, b).query(api.workspace.get, { workspaceId: ws })).toBeNull();
    await as(t, a).mutation(api.workspace.deleteWorkspace, { workspaceId: ws });
    expect(await as(t, a).query(api.workspace.get, { workspaceId: ws })).toBeNull();
  });

  it("unauthenticated callers are refused", async () => {
    const t = fresh();
    expect(await errorCode(t.query(api.workspace.listMine, {}))).toBe("Unauthenticated");
    expect(await errorCode(t.mutation(api.workspace.create, { name: "x" }))).toBe("Unauthenticated");
  });
});

describe("workspace.apply", () => {
  it("replays an op with the client's seed so ids and times match the optimistic record", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const s = seed("2026-10-03T10:00:00.000Z");
    const created = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createProject", data: { name: "Web", key: "WEB" } },
      seed: s,
    })) as Project;
    expect(created.id).toBe(`p_${s.ids[0]}`);
    expect(created.leadId).toBe(me.userId);
    expect(created.memberIds).toEqual([me.userId]);

    // The client's optimistic copy, computed from the same seed, is identical
    // except for the clock: the server keeps the client's `now` only within
    // the skew window, and this seed is a fixed past date.
    const view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    const optimistic = runOp(
      { ...view.state, projects: [] },
      { type: "createProject", data: { name: "Web", key: "WEB" } },
      seededContext(s, { actorId: me.userId }),
    ).result as Project;
    expect({ ...created, createdAt: "", updatedAt: "" }).toEqual({ ...optimistic, createdAt: "", updatedAt: "" });
  });

  it("keeps the client's clock when it is within the skew window", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const now = new Date(Date.now() - 1000).toISOString();
    const created = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createProject", data: { name: "Web", key: "WEB" } },
      seed: seed(now),
    })) as Project;
    expect(created.createdAt).toBe(now);
  });

  it("numbers tasks per project and attributes activity to the caller, not the op", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const member = await signUp(t, "member@example.com");
    const ws = await workspaceFor(t, owner);
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    await as(t, member).mutation(api.members.acceptInvite, { token });

    const project = (await as(t, owner).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createProject", data: { name: "Web", key: "WEB" } },
      seed: seed(),
    })) as Project;
    const t1 = (await as(t, owner).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createTask", data: { projectId: project.id, title: "One" } },
      seed: seed(),
    })) as Task;
    const t2 = (await as(t, member).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createTask", data: { projectId: project.id, title: "Two" } },
      seed: seed(),
    })) as Task;
    expect([t1.number, t2.number]).toEqual([1, 2]);
    expect(t2.activity[0].authorId).toBe(member.userId);

    const view = (await as(t, owner).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.projects[0].nextTaskNumber).toBe(3);
    // Newest first, as the pure mutations prepend.
    expect(view.state.tasks.map((x) => x.title)).toEqual(["Two", "One"]);
  });

  it("rejects non-members, owner-only ops from members, and unknown targets with typed errors", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const member = await signUp(t, "member@example.com");
    const stranger = await signUp(t, "stranger@example.com");
    const ws = await workspaceFor(t, owner);
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    await as(t, member).mutation(api.members.acceptInvite, { token });
    const project = (await as(t, owner).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createProject", data: { name: "Web", key: "WEB" } },
      seed: seed(),
    })) as Project;

    expect(
      await errorCode(
        as(t, stranger).mutation(api.workspace.apply, {
          workspaceId: ws,
          op: { type: "createTask", data: { projectId: project.id, title: "x" } },
          seed: seed(),
        }),
      ),
    ).toBe("Forbidden");
    expect(
      await errorCode(
        as(t, member).mutation(api.workspace.apply, { workspaceId: ws, op: { type: "deleteProject", id: project.id }, seed: seed() }),
      ),
    ).toBe("Forbidden");
    expect(
      await errorCode(
        as(t, member).mutation(api.workspace.apply, {
          workspaceId: ws,
          op: { type: "updateTask", id: "t_nope", patch: { title: "x" } },
          seed: seed(),
        }),
      ),
    ).toBe("NotFound");
    expect(
      await errorCode(
        as(t, member).mutation(api.workspace.apply, {
          workspaceId: ws,
          op: { type: "createTask", data: { projectId: "p_nope", title: "x" } },
          seed: seed(),
        }),
      ),
    ).toBe("NotFound");
    // A seed that reuses an existing id is a conflict, not a silent overwrite.
    expect(
      await errorCode(
        as(t, owner).mutation(api.workspace.apply, {
          workspaceId: ws,
          op: { type: "createProject", data: { name: "Dup", key: "DUP" } },
          seed: { ids: [project.id.slice(2), "zz"], now: new Date().toISOString() },
        }),
      ),
    ).toBe("Conflict");
  });

  it("clears fields through `unset` and never through undefined", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const project = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createProject", data: { name: "Web", key: "WEB" } },
      seed: seed(),
    })) as Project;
    const task = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createTask", data: { projectId: project.id, title: "x", assigneeId: me.userId, estimate: 3 } },
      seed: seed(),
    })) as Task;
    await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "updateTask", id: task.id, patch: { title: "y" }, unset: ["assigneeId", "estimate"] },
      seed: seed(),
    });
    const view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    const after = view.state.tasks[0];
    expect(after.title).toBe("y");
    expect(after).not.toHaveProperty("assigneeId");
    expect(after).not.toHaveProperty("estimate");
    expect(after.activity.at(-1)?.message).toBe("Unassigned");
    expect(
      await errorCode(
        as(t, me).mutation(api.workspace.apply, {
          workspaceId: ws,
          op: { type: "updateTask", id: task.id, patch: {}, unset: ["title"] },
          seed: seed(),
        }),
      ),
    ).toBe("Validation");
  });

  it("a patch cannot carry comments or activity (validator rejects extra fields)", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const project = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createProject", data: { name: "Web", key: "WEB" } },
      seed: seed(),
    })) as Project;
    const task = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createTask", data: { projectId: project.id, title: "x" } },
      seed: seed(),
    })) as Task;
    await expect(
      as(t, me).mutation(api.workspace.apply, {
        workspaceId: ws,
        op: {
          type: "updateTask",
          id: task.id,
          patch: { comments: [{ id: "c", authorId: "someone-else", body: "forged", createdAt: "2026-01-01T00:00:00Z" }] },
        } as never,
        seed: seed(),
      }),
    ).rejects.toThrow();
  });

  it("delete moves a task to the trash and restore brings the server's copy back", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const project = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createProject", data: { name: "Web", key: "WEB" } },
      seed: seed(),
    })) as Project;
    const task = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createTask", data: { projectId: project.id, title: "Keep me" } },
      seed: seed(),
    })) as Task;
    await as(t, me).mutation(api.workspace.apply, { workspaceId: ws, op: { type: "deleteTask", id: task.id }, seed: seed() });
    let view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.tasks).toEqual([]);
    const restored = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "restoreTask", id: task.id },
      seed: seed(),
    })) as Task;
    expect(restored).toEqual(task);
    view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.tasks).toEqual([task]);
    // Second restore: nothing in the trash any more.
    expect(
      await errorCode(
        as(t, me).mutation(api.workspace.apply, { workspaceId: ws, op: { type: "restoreTask", id: task.id }, seed: seed() }),
      ),
    ).toBe("NotFound");
  });

  it("deleting a project cascades its tasks and restores them together", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const project = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createProject", data: { name: "Web", key: "WEB" } },
      seed: seed(),
    })) as Project;
    for (const title of ["a", "b"]) {
      await as(t, me).mutation(api.workspace.apply, {
        workspaceId: ws,
        op: { type: "createTask", data: { projectId: project.id, title } },
        seed: seed(),
      });
    }
    await as(t, me).mutation(api.workspace.apply, { workspaceId: ws, op: { type: "deleteProject", id: project.id }, seed: seed() });
    let view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.projects).toEqual([]);
    expect(view.state.tasks).toEqual([]);
    await as(t, me).mutation(api.workspace.apply, { workspaceId: ws, op: { type: "restoreProject", id: project.id }, seed: seed() });
    view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.projects.map((p) => p.id)).toEqual([project.id]);
    expect(view.state.tasks.map((x) => x.title).sort()).toEqual(["a", "b"]);
  });

  it("posts: create, snapshot validation, duplicate, delete/restore", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const post = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createPost", data: { title: "Hook", platform: "tiktok" } },
      seed: seed(),
    })) as Post;
    expect(post.status).toBe("draft");
    expect(
      await errorCode(
        as(t, me).mutation(api.workspace.apply, {
          workspaceId: ws,
          op: {
            type: "addSnapshot",
            postId: post.id,
            snapshot: { atMinutes: -5, impressions: 1, views: 1, likes: 0, comments: 0, shares: 0, saves: 0 },
          },
          seed: seed(),
        }),
      ),
    ).toBe("Validation");
    const copy = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "duplicatePost", id: post.id },
      seed: seed(),
    })) as Post;
    expect(copy.title).toBe("Hook (variant)");
    await as(t, me).mutation(api.workspace.apply, { workspaceId: ws, op: { type: "deletePost", id: copy.id }, seed: seed() });
    const back = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "restorePost", id: copy.id },
      seed: seed(),
    })) as Post;
    expect(back).toEqual(copy);
  });

  it("removeLabel is owner-only and strips the label from every task", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const label = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "addLabel", data: { name: "bug", color: "#dc2626" } },
      seed: seed(),
    })) as { id: string };
    const project = (await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createProject", data: { name: "Web", key: "WEB" } },
      seed: seed(),
    })) as Project;
    await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "createTask", data: { projectId: project.id, title: "x", labelIds: [label.id] } },
      seed: seed(),
    });
    await as(t, me).mutation(api.workspace.apply, { workspaceId: ws, op: { type: "removeLabel", id: label.id }, seed: seed() });
    const view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.labels).toEqual([]);
    expect(view.state.tasks[0].labelIds).toEqual([]);
  });
});

describe("import / replaceContent", () => {
  it("creates a workspace from a local export, remapping the local owner to the caller", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const base = emptyWorkspace({ demoPosts: true });
    const owner = base.currentUserId;
    // Give the local owner some history to carry over, and another local
    // user some too.
    const tasks = base.tasks.map((task, i) =>
      i === 0
        ? {
            ...task,
            comments: [
              { id: "c_own", authorId: owner, body: "mine", createdAt: "2026-01-01T00:00:00.000Z" },
              { id: "c_other", authorId: "u_mina", body: "theirs", createdAt: "2026-01-01T00:00:00.000Z" },
            ],
            activity: [...task.activity, { id: "a_own", at: "2026-01-01T00:00:00.000Z", authorId: owner, message: "Commented" }],
          }
        : task,
    );
    const ws = (await as(t, me).mutation(api.workspace.create, {
      name: "Imported",
      content: { labels: base.labels, projects: base.projects, tasks, posts: base.posts },
      fromUserId: owner,
    })) as Id<"workspaces">;
    const view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.projects).toHaveLength(base.projects.length);
    expect(view.state.tasks).toHaveLength(base.tasks.length);
    expect(view.state.posts).toHaveLength(base.posts.length);

    // Exactly what the local owner led, belonged to and was assigned is now the caller's.
    const led = base.projects.filter((p) => p.leadId === owner).length;
    const memberOf = base.projects.filter((p) => p.memberIds.includes(owner)).length;
    const assigned = base.tasks.filter((x) => x.assigneeId === owner).length;
    expect(led).toBeGreaterThan(0);
    expect(assigned).toBeGreaterThan(0);
    expect(view.state.projects.filter((p) => p.leadId === me.userId)).toHaveLength(led);
    expect(view.state.projects.filter((p) => p.memberIds.includes(me.userId))).toHaveLength(memberOf);
    expect(view.state.tasks.filter((x) => x.assigneeId === me.userId)).toHaveLength(assigned);
    // Other local users are not members here: their references are dropped.
    for (const p of view.state.projects) for (const m of p.memberIds) expect(m).toBe(me.userId);

    // The importer's own history is theirs; anyone else's can never resolve
    // to a real account; system activity stays authorless.
    const first = view.state.tasks.find((x) => x.id === base.tasks[0].id)!;
    expect(first.comments.find((c) => c.id === "c_own")?.authorId).toBe(me.userId);
    expect(first.comments.find((c) => c.id === "c_other")?.authorId).toBe("imported:u_mina");
    expect(first.activity.find((a) => a.id === "a_own")?.authorId).toBe(me.userId);
    const systemBefore = base.tasks.flatMap((x) => x.activity).filter((a) => a.authorId === undefined).length;
    const systemAfter = view.state.tasks.flatMap((x) => x.activity).filter((a) => a.authorId === undefined).length;
    expect(systemAfter).toBe(systemBefore);
  });

  it("an import cannot attribute history to a real member", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const victim = await signUp(t, "victim@example.com");
    const ws = await workspaceFor(t, owner);
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    await as(t, victim).mutation(api.members.acceptInvite, { token });
    const base = emptyWorkspace({ demoPosts: false });
    const forged = {
      ...base.tasks[0],
      comments: [{ id: "c1", authorId: victim.userId, body: "I approve", createdAt: "2026-01-01T00:00:00.000Z" }],
      activity: [{ id: "a1", at: "2026-01-01T00:00:00.000Z", authorId: victim.userId, message: "Status → done" }],
    };
    await as(t, owner).mutation(api.workspace.replaceContent, {
      workspaceId: ws,
      content: { labels: [], projects: base.projects, tasks: [forged], posts: [] },
    });
    const view = (await as(t, owner).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    const task = view.state.tasks[0];
    expect(task.comments[0].authorId).toBe(`imported:${victim.userId}`);
    expect(task.activity[0].authorId).toBe(`imported:${victim.userId}`);
    expect(view.state.users.some((u) => u.id === task.comments[0].authorId)).toBe(false);
  });

  it("without fromUserId, no history is credited to the importer", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const base = emptyWorkspace({ demoPosts: false });
    const ws = (await as(t, me).mutation(api.workspace.create, {
      name: "Imported",
      content: { labels: base.labels, projects: base.projects, tasks: base.tasks, posts: [] },
    })) as Id<"workspaces">;
    const view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    const credited = view.state.tasks.flatMap((x) => [...x.activity, ...x.comments]).filter((e) => e.authorId === me.userId);
    expect(credited).toEqual([]);
  });

  it("replaceContent is owner-only and rejects dangling or duplicate ids", async () => {
    const t = fresh();
    const owner = await signUp(t, "owner@example.com");
    const member = await signUp(t, "member@example.com");
    const ws = await workspaceFor(t, owner);
    const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
    await as(t, member).mutation(api.members.acceptInvite, { token });
    const local = emptyWorkspace({ demoPosts: false });
    const content = { labels: local.labels, projects: local.projects, tasks: local.tasks, posts: [] };
    expect(await errorCode(as(t, member).mutation(api.workspace.replaceContent, { workspaceId: ws, content }))).toBe("Forbidden");
    expect(
      await errorCode(
        as(t, owner).mutation(api.workspace.replaceContent, {
          workspaceId: ws,
          content: { ...content, tasks: [{ ...content.tasks[0], projectId: "p_missing" }] },
        }),
      ),
    ).toBe("Validation");
    expect(
      await errorCode(
        as(t, owner).mutation(api.workspace.replaceContent, {
          workspaceId: ws,
          content: { ...content, projects: [content.projects[0], content.projects[0]] },
        }),
      ),
    ).toBe("Validation");
    await as(t, owner).mutation(api.workspace.replaceContent, { workspaceId: ws, content, fromUserId: local.currentUserId });
    const view = (await as(t, owner).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.projects).toHaveLength(local.projects.length);
    expect(view.state.posts).toEqual([]);
  });
});
