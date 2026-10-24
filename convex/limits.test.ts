import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { as, fresh, freshWithLimits, seed, signUp, workspaceFor, type T } from "./test.helpers";
import type { WorkspaceView } from "./workspace";
import { ACTIVITY_CAP } from "./lib";
import { LIMITS } from "../src/lib/limits";
import { emptyWorkspace } from "../src/lib/mutations";
import type { Project, Task } from "../src/lib/types";

const errorOf = async (p: Promise<unknown>): Promise<{ code: string; message: string }> => {
  try {
    await p;
    return { code: "none", message: "" };
  } catch (e) {
    if (e instanceof ConvexError) return e.data as { code: string; message: string };
    throw e;
  }
};

async function projectAndTask(t: T, ws: Id<"workspaces">, me: Parameters<typeof as>[1]) {
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
  return { project, task };
}

/** Write straight to the table, bypassing apply's checks — how a pre-existing or hostile record would look. */
async function overwriteTask(t: T, ws: Id<"workspaces">, id: string, patch: Partial<Task>) {
  await t.run(async (ctx) => {
    const doc = await ctx.db
      .query("tasks")
      .withIndex("by_workspace_id", (q) => q.eq("workspaceId", ws).eq("id", id))
      .unique();
    if (!doc) throw new Error("no task");
    await ctx.db.patch(doc._id, patch as never);
  });
}

describe("cloud size limits are enforced on every write", () => {
  it("rejects an over-long title with a readable Validation error", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const { task } = await projectAndTask(t, ws, me);
    const err = await errorOf(
      as(t, me).mutation(api.workspace.apply, {
        workspaceId: ws,
        op: { type: "updateTask", id: task.id, patch: { title: "x".repeat(LIMITS.task.title + 1) } },
        seed: seed(),
      }),
    );
    expect(err.code).toBe("Validation");
    expect(err.message).toMatch(/title is too long/i);
    // Exactly at the limit is fine.
    await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "updateTask", id: task.id, patch: { title: "x".repeat(LIMITS.task.title) } },
      seed: seed(),
    });
  });

  it("refuses a comment past the per-issue comment cap", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const { task } = await projectAndTask(t, ws, me);
    const comments = Array.from({ length: LIMITS.task.comments }, (_, i) => ({
      id: `c${i}`,
      authorId: me.userId,
      body: "ok",
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    await overwriteTask(t, ws, task.id, { comments });
    const err = await errorOf(
      as(t, me).mutation(api.workspace.apply, {
        workspaceId: ws,
        op: { type: "addComment", taskId: task.id, body: "one more" },
        seed: seed(),
      }),
    );
    expect(err.code).toBe("Validation");
    expect(err.message).toMatch(/Comments on this issue/);
  });

  it("refuses an edit that would leave a record over the byte budget", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const { task } = await projectAndTask(t, ws, me);
    // 300 comments of 1,000 characters each: every field is within its cap,
    // the record as a whole is not.
    const comments = Array.from({ length: 300 }, (_, i) => ({
      id: `c${i}`,
      authorId: me.userId,
      body: "y".repeat(1000),
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    await overwriteTask(t, ws, task.id, { comments });
    const err = await errorOf(
      as(t, me).mutation(api.workspace.apply, {
        workspaceId: ws,
        op: { type: "updateTask", id: task.id, patch: { title: "renamed" } },
        seed: seed(),
      }),
    );
    expect(err.code).toBe("Validation");
    expect(err.message).toMatch(/too large to store/);
  });

  it("trims system activity to the cap instead of refusing the edit", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const { task } = await projectAndTask(t, ws, me);
    const activity = Array.from({ length: ACTIVITY_CAP }, (_, i) => ({
      id: `a${i}`,
      at: "2026-01-01T00:00:00.000Z",
      authorId: me.userId,
      message: `entry ${i}`,
    }));
    await overwriteTask(t, ws, task.id, { activity });
    await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "moveTaskStatus", id: task.id, status: "done" },
      seed: seed(),
    });
    const view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    const stored = view.state.tasks[0];
    expect(stored.activity).toHaveLength(ACTIVITY_CAP);
    expect(stored.activity[0].id).toBe("a1"); // the oldest entry went
    expect(stored.activity.at(-1)?.message).toMatch(/Status → done/);
  });

  it("imports are checked record by record and capped in total", async () => {
    const t = fresh();
    const me = await signUp(t, "me@example.com");
    const local = emptyWorkspace({ demoPosts: false });
    const bad = { ...local.tasks[0], title: "z".repeat(LIMITS.task.title + 1) };
    const err = await errorOf(
      as(t, me).mutation(api.workspace.create, {
        name: "Import",
        content: { labels: local.labels, projects: local.projects, tasks: [bad, ...local.tasks.slice(1)], posts: [] },
        fromUserId: local.currentUserId,
      }),
    );
    expect(err.code).toBe("Validation");
    expect(err.message).toContain(bad.id);

    // 40 issues of ~240 KB each (47 comments at the 5,000-character cap):
    // every record fits its 256 KB budget, the import as a whole does not.
    const project = local.projects[0];
    const big = Array.from({ length: 40 }, (_, i) => ({
      ...local.tasks[0],
      id: `t_big${i}`,
      projectId: project.id,
      comments: Array.from({ length: 47 }, (_, j) => ({
        id: `c${i}_${j}`,
        authorId: local.currentUserId,
        body: "b".repeat(LIMITS.task.commentBody),
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
    }));
    const tooBig = await errorOf(
      as(t, me).mutation(api.workspace.create, {
        name: "Huge",
        content: { labels: [], projects: [project], tasks: big, posts: [] },
      }),
    );
    expect(tooBig.code).toBe("Validation");
    expect(tooBig.message).toMatch(/one import can be at most 8 MB/);
  });
});

describe("workspace.get degrades instead of failing when a workspace outgrows one read", () => {
  it("returns the newest records that fit and names what it cut, under Convex's real limits", async () => {
    const t = freshWithLimits();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    const { project } = await projectAndTask(t, ws, me);
    // 20 tasks of ~900 KB each (each under Convex's 1 MiB document cap,
    // ~18 MB together): written directly, as data that predates the limits
    // or slipped past them would be.
    for (let i = 0; i < 20; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert("tasks", {
          workspaceId: ws,
          id: `t_big${String(i).padStart(2, "0")}`,
          projectId: project.id,
          number: 100 + i,
          type: "task",
          title: `big ${i}`,
          description: "q".repeat(900 * 1024),
          status: "todo",
          priority: "medium",
          labelIds: [],
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
          updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
          comments: [],
          activity: [],
        });
      });
    }
    // An unbudgeted read of the same data fails, so this test exercises the limit.
    await expect(t.run(async (ctx) => ctx.db.query("tasks").collect())).rejects.toThrow(/Read too much data/);

    const view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.truncated).toEqual(["tasks"]);
    expect(view.state.projects.map((p) => p.id)).toEqual([project.id]);
    expect(view.state.tasks.length).toBeGreaterThan(5);
    expect(view.state.tasks.length).toBeLessThan(21);
    // Newest first: the most recently inserted big task is present.
    expect(view.state.tasks.some((x) => x.id === "t_big19")).toBe(true);

    // Scoped writes keep working on the full data set.
    await as(t, me).mutation(api.workspace.apply, {
      workspaceId: ws,
      op: { type: "deleteTask", id: "t_big00" },
      seed: seed(),
    });
  });

  it("reports nothing truncated for an ordinary workspace", async () => {
    const t = freshWithLimits();
    const me = await signUp(t, "me@example.com");
    const ws = await workspaceFor(t, me);
    await projectAndTask(t, ws, me);
    const view = (await as(t, me).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;
    expect(view.truncated).toEqual([]);
  });
});
