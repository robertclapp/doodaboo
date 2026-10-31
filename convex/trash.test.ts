import { describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { as, fresh, freshWithLimits, seed, signUp, workspaceFor, type Account, type T } from "./test.helpers";
import { DELETE_MAX_RECORDS } from "./workspace";
import type { WorkspaceView } from "./workspace";
import type { Post, Project, Task } from "../src/lib/types";

const errorOf = async (p: Promise<unknown>): Promise<{ code: string; message: string }> => {
  try {
    await p;
    return { code: "none", message: "" };
  } catch (e) {
    if (e instanceof ConvexError) return e.data as { code: string; message: string };
    throw e;
  }
};

const apply = (t: T, who: Account, ws: Id<"workspaces">, op: unknown, s = seed()) =>
  as(t, who).mutation(api.workspace.apply, { workspaceId: ws, op: op as never, seed: s });

async function team() {
  const t = fresh();
  const owner = await signUp(t, "owner@example.com");
  const member = await signUp(t, "member@example.com");
  const ws = await workspaceFor(t, owner);
  const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
  await as(t, member).mutation(api.members.acceptInvite, { token });
  return { t, owner, member, ws };
}

const trashRows = (t: T, ws: Id<"workspaces">) =>
  t.run(async (ctx) =>
    (await ctx.db.query("trash").withIndex("by_workspace_kind_id", (q) => q.eq("workspaceId", ws)).collect()).map((r) => ({
      kind: r.kind,
      id: r.id,
      group: r.group,
    })),
  );

describe("trash", () => {
  it("a deleted project's issues each get their own trash row, and come back together", async () => {
    const { t, owner, ws } = await team();
    const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Web", key: "WEB" } })) as Project;
    const ids: string[] = [];
    for (const title of ["a", "b", "c"]) {
      ids.push(((await apply(t, owner, ws, { type: "createTask", data: { projectId: project.id, title } })) as Task).id);
    }
    await apply(t, owner, ws, { type: "deleteProject", id: project.id });
    const rows = await trashRows(t, ws);
    expect(rows.filter((r) => r.kind === "project")).toEqual([{ kind: "project", id: project.id, group: undefined }]);
    expect(rows.filter((r) => r.kind === "task").map((r) => [r.id, r.group]).sort()).toEqual(ids.map((id) => [id, project.id]).sort());

    await apply(t, owner, ws, { type: "restoreProject", id: project.id });
    const view = (await as(t, owner).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.tasks.map((x) => x.id).sort()).toEqual([...ids].sort());
    expect(await trashRows(t, ws)).toEqual([]);
  });

  it("a deleted record's id is reserved: nobody can create under it", async () => {
    const { t, owner, member, ws } = await team();
    const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Secret", key: "SEC" } })) as Project;
    const task = (await apply(t, owner, ws, { type: "createTask", data: { projectId: project.id, title: "x" } })) as Task;
    await apply(t, owner, ws, { type: "deleteProject", id: project.id });
    // The member reuses the trashed ids as seed ids.
    const squatProject = await errorOf(
      apply(t, member, ws, { type: "createProject", data: { name: "Squat", key: "SQ" } }, { ids: [project.id.slice(2), "zz1"], now: new Date().toISOString() }),
    );
    expect(squatProject.code).toBe("Conflict");
    const other = (await apply(t, member, ws, { type: "createProject", data: { name: "Other", key: "OT" } })) as Project;
    const squatTask = await errorOf(
      apply(t, member, ws, { type: "createTask", data: { projectId: other.id, title: "decoy" } }, {
        ids: [task.id.slice(2), "zz2"],
        now: new Date().toISOString(),
      }),
    );
    expect(squatTask.code).toBe("Conflict");
    // The owner's Undo still works, with every issue.
    await apply(t, owner, ws, { type: "restoreProject", id: project.id });
    const view = (await as(t, owner).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.projects.find((p) => p.id === project.id)?.name).toBe("Secret");
    expect(view.state.tasks.some((x) => x.id === task.id)).toBe(true);
  });

  it("a restore whose id is live again fails and keeps the snapshot", async () => {
    const { t, owner, ws } = await team();
    const post = (await apply(t, owner, ws, { type: "createPost", data: { title: "Hook", platform: "tiktok" } })) as Post;
    await apply(t, owner, ws, { type: "deletePost", id: post.id });
    // Put a live record under the id behind the API's back (as legacy data could).
    await t.run(async (ctx) => {
      await ctx.db.insert("posts", { ...post, title: "Squatter", workspaceId: ws });
    });
    const err = await errorOf(apply(t, owner, ws, { type: "restorePost", id: post.id }));
    expect(err.code).toBe("Conflict");
    expect((await trashRows(t, ws)).map((r) => r.id)).toEqual([post.id]);
  });

  it("an issue whose project was deleted cannot be restored on its own", async () => {
    const { t, owner, member, ws } = await team();
    const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Web", key: "WEB" } })) as Project;
    const task = (await apply(t, member, ws, { type: "createTask", data: { projectId: project.id, title: "x" } })) as Task;
    await apply(t, member, ws, { type: "deleteTask", id: task.id });
    await apply(t, owner, ws, { type: "deleteProject", id: project.id });
    const err = await errorOf(apply(t, member, ws, { type: "restoreTask", id: task.id }));
    expect(err.code).toBe("Conflict");
    expect(err.message).toMatch(/Restore the project/);
    // After the project comes back, the issue can.
    await apply(t, owner, ws, { type: "restoreProject", id: project.id });
    await apply(t, member, ws, { type: "restoreTask", id: task.id });
    const view = (await as(t, owner).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.state.tasks.map((x) => x.id)).toEqual([task.id]);
  });

  it("refuses a project delete too large to move into the trash in one go", async () => {
    const { t, owner, ws } = await team();
    const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Huge", key: "HUG" } })) as Project;
    // 30 issues of ~240 KB each (~7 MB), written directly.
    for (let i = 0; i < 30; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert("tasks", {
          workspaceId: ws,
          id: `t_bulk${i}`,
          projectId: project.id,
          number: i + 1,
          type: "task",
          title: `bulk ${i}`,
          description: "",
          status: "todo",
          priority: "medium",
          labelIds: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          comments: Array.from({ length: 47 }, (_, j) => ({
            id: `c${i}_${j}`,
            authorId: owner.userId,
            body: "b".repeat(5000),
            createdAt: "2026-01-01T00:00:00.000Z",
          })),
          activity: [],
        });
      });
    }
    const err = await errorOf(apply(t, owner, ws, { type: "deleteProject", id: project.id }));
    expect(err.code).toBe("Validation");
    expect(err.message).toMatch(/Delete some of its issues first/);
  });

  it("stores the seed's time in canonical ISO form", async () => {
    const { t, owner, ws } = await team();
    const created = (await apply(t, owner, ws, { type: "createProject", data: { name: "Web", key: "WEB" } }, {
      ids: ["iso1", "iso2"],
      now: new Date().toUTCString(),
    })) as Project;
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("purgeTrash drops rows older than the retention window and keeps newer ones", async () => {
    const { t, owner, ws } = await team();
    const a = (await apply(t, owner, ws, { type: "createPost", data: { title: "old", platform: "tiktok" } })) as Post;
    const b = (await apply(t, owner, ws, { type: "createPost", data: { title: "new", platform: "tiktok" } })) as Post;
    await apply(t, owner, ws, { type: "deletePost", id: a.id });
    await apply(t, owner, ws, { type: "deletePost", id: b.id });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("trash")
        .withIndex("by_workspace_kind_id", (q) => q.eq("workspaceId", ws).eq("kind", "post").eq("id", a.id))
        .unique();
      await ctx.db.patch(row!._id, { deletedAt: "2020-01-01T00:00:00.000Z" });
    });
    expect(await t.mutation(internal.workspace.purgeTrash, {})).toBe(1);
    expect((await trashRows(t, ws)).map((r) => r.id)).toEqual([b.id]);
  });
});

describe("trash at scale, under Convex's real transaction limits", () => {
  async function bigProject(issues: number) {
    const t = freshWithLimits();
    const owner = await signUp(t, "owner@example.com");
    const ws = await workspaceFor(t, owner);
    const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Big", key: "BIG" } })) as Project;
    await t.run(async (ctx) => {
      for (let i = 0; i < issues; i++) {
        await ctx.db.insert("tasks", {
          workspaceId: ws,
          id: `t_n${i}`,
          projectId: project.id,
          number: i + 1,
          type: "task",
          title: `issue ${i}`,
          description: "",
          status: "todo",
          priority: "medium",
          labelIds: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          comments: [],
          activity: [],
        });
      }
    });
    return { t, owner, ws, project };
  }

  it(`a project at the ${DELETE_MAX_RECORDS}-issue cap deletes and restores`, async () => {
    const { t, owner, ws, project } = await bigProject(DELETE_MAX_RECORDS);
    await apply(t, owner, ws, { type: "deleteProject", id: project.id });
    await apply(t, owner, ws, { type: "restoreProject", id: project.id });
    const count = await t.run(async (ctx) => (await ctx.db.query("tasks").collect()).length);
    expect(count).toBe(DELETE_MAX_RECORDS);
    expect(await trashRows(t, ws)).toEqual([]);
  }, 120_000);

  it("one issue over the cap is refused with a readable message, not a platform error", async () => {
    const { t, owner, ws, project } = await bigProject(DELETE_MAX_RECORDS + 1);
    const err = await errorOf(apply(t, owner, ws, { type: "deleteProject", id: project.id }));
    expect(err.code).toBe("Validation");
    expect(err.message).toMatch(/at most 3000/);
  }, 120_000);

  it("a project with ~4.7 MB of issues deletes and restores", async () => {
    const t = freshWithLimits();
    const owner = await signUp(t, "owner@example.com");
    const ws = await workspaceFor(t, owner);
    const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Heavy", key: "HVY" } })) as Project;
    for (let i = 0; i < 24; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert("tasks", {
          workspaceId: ws,
          id: `t_h${i}`,
          projectId: project.id,
          number: i + 1,
          type: "task",
          title: `heavy ${i}`,
          description: "d".repeat(19_000),
          status: "todo",
          priority: "medium",
          labelIds: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          comments: Array.from({ length: 36 }, (_, j) => ({
            id: `c${i}_${j}`,
            authorId: owner.userId,
            body: "b".repeat(5000),
            createdAt: "2026-01-01T00:00:00.000Z",
          })),
          activity: [],
        });
      });
    }
    await apply(t, owner, ws, { type: "deleteProject", id: project.id });
    await apply(t, owner, ws, { type: "restoreProject", id: project.id });
    const count = await t.run(async (ctx) => (await ctx.db.query("tasks").collect()).length);
    expect(count).toBe(24);
  }, 120_000);

  it("deleting a large workspace ends access at once and clears the content in the background", async () => {
    vi.useFakeTimers();
    try {
      const t = freshWithLimits();
      const owner = await signUp(t, "owner@example.com");
      const ws = await workspaceFor(t, owner);
      const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Big", key: "BIG" } })) as Project;
      // ~20 MB of issues: more than one transaction could delete.
      for (let i = 0; i < 80; i++) {
        await t.run(async (ctx) => {
          await ctx.db.insert("tasks", {
            workspaceId: ws,
            id: `t_w${i}`,
            projectId: project.id,
            number: i + 1,
            type: "task",
            title: `w ${i}`,
            description: "",
            status: "todo",
            priority: "medium",
            labelIds: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            comments: Array.from({ length: 48 }, (_, j) => ({
              id: `c${i}_${j}`,
              authorId: owner.userId,
              body: "b".repeat(5000),
              createdAt: "2026-01-01T00:00:00.000Z",
            })),
            activity: [],
          });
        });
      }
      await as(t, owner).mutation(api.workspace.deleteWorkspace, { workspaceId: ws });
      expect(await as(t, owner).query(api.workspace.get, { workspaceId: ws })).toBeNull();
      expect(await as(t, owner).query(api.workspace.listMine, {})).toEqual([]);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const left = await t.run(async (ctx) => (await ctx.db.query("tasks").collect()).length);
      expect(left).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);

  it("replaceContent refuses to replace more existing content than one step can carry", async () => {
    const t = freshWithLimits();
    const owner = await signUp(t, "owner@example.com");
    const ws = await workspaceFor(t, owner);
    const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Big", key: "BIG" } })) as Project;
    for (let i = 0; i < 16; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert("tasks", {
          workspaceId: ws,
          id: `t_r${i}`,
          projectId: project.id,
          number: i + 1,
          type: "task",
          title: `r ${i}`,
          description: "",
          status: "todo",
          priority: "medium",
          labelIds: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          comments: Array.from({ length: 48 }, (_, j) => ({
            id: `c${i}_${j}`,
            authorId: owner.userId,
            body: "b".repeat(5000),
            createdAt: "2026-01-01T00:00:00.000Z",
          })),
          activity: [],
        });
      });
    }
    const err = await errorOf(
      as(t, owner).mutation(api.workspace.replaceContent, {
        workspaceId: ws,
        content: { labels: [], projects: [], tasks: [], posts: [] },
      }),
    );
    expect(err.code).toBe("Validation");
    expect(err.message).toMatch(/too much to replace in one step/);
  }, 120_000);

  it("purgeTrash drains a backlog larger than one pass can read", async () => {
    vi.useFakeTimers();
    try {
      const t = freshWithLimits();
      const owner = await signUp(t, "owner@example.com");
      const ws = await workspaceFor(t, owner);
      // 40 stale rows of ~400 KB: 16 MB, more than one function may read.
      for (let i = 0; i < 40; i++) {
        await t.run(async (ctx) => {
          await ctx.db.insert("trash", {
            workspaceId: ws,
            kind: "post",
            id: `po_old${i}`,
            snapshot: { blob: "z".repeat(400 * 1024) },
            deletedAt: "2020-01-01T00:00:00.000Z",
            deletedBy: owner.userId,
          });
        });
      }
      const first = await t.mutation(internal.workspace.purgeTrash, {});
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThan(40);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await trashRows(t, ws)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);
});
