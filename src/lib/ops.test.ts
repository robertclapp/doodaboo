import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  drawSeed,
  Op,
  OpError,
  opScope,
  OWNER_ONLY_OPS,
  runOp,
  SEED_IDS,
  seededContext,
  toWirePatch,
  TrashLookup,
} from "./ops";
import { emptyWorkspace, WorkspaceState } from "./mutations";
import type { Post, Task } from "./types";

const seed = () => emptyWorkspace({ demoPosts: true });
const fixedSeed = {
  ids: ["aaaaaa", "bbbbbb", "cccccc", "dddddd", "eeeeee", "ffffff"],
  now: "2026-01-02T03:04:05.000Z",
};

describe("ops — seeded replay is deterministic", () => {
  it("client and server produce byte-identical records from one seed", () => {
    const state = seed();
    const op: Op = {
      type: "createTask",
      data: { projectId: "p_web", title: "Ship it", assigneeId: "u_leo" },
    };
    const a = runOp(state, op, seededContext(fixedSeed, { actorId: "u_rob" }));
    const b = runOp(state, op, seededContext(fixedSeed, { actorId: "u_rob" }));
    assert.deepEqual(a.result, b.result);
    assert.deepEqual(a.state, b.state);
    const task = a.result as Task;
    assert.equal(task.id, "t_aaaaaa");
    assert.equal(task.activity[0].id, "bbbbbb");
    assert.equal(task.createdAt, fixedSeed.now);
    assert.equal(task.activity[0].authorId, "u_rob");
  });

  it("draws enough ids for the hungriest op", () => {
    // A task update that changes status, priority and assignee draws three
    // activity ids; nothing draws more than SEED_IDS.
    const state = seed();
    const existing = state.tasks.find((t) => t.id === "t_p_web_1")!;
    let drawn = 0;
    const ctx = seededContext(fixedSeed, {});
    const counting = { ...ctx, ids: () => (drawn++, ctx.ids!()) };
    runOp(
      state,
      {
        type: "updateTask",
        id: "t_p_web_1",
        patch: {
          status: existing.status === "done" ? "todo" : "done",
          priority: existing.priority === "urgent" ? "low" : "urgent",
          assigneeId: existing.assigneeId === "u_mina" ? "u_sara" : "u_mina",
        },
      },
      counting,
    );
    assert.equal(drawn, 3);
    assert.ok(drawn <= SEED_IDS);
    assert.equal(drawSeed().ids.length, SEED_IDS);
  });

  it("actor comes from the context, never from the op", () => {
    const state = seed();
    const r = runOp(
      state,
      { type: "addComment", taskId: "t_p_web_1", body: "hi" },
      seededContext(fixedSeed, { actorId: "u_sara" }),
    );
    const task = r.state.tasks.find((t) => t.id === "t_p_web_1")!;
    assert.equal(task.comments.at(-1)!.authorId, "u_sara");
    assert.equal(task.activity.at(-1)!.authorId, "u_sara");
  });
});

describe("ops — missing targets fail loudly", () => {
  const cases: Op[] = [
    { type: "updateTask", id: "t_nope", patch: { title: "x" } },
    { type: "deleteTask", id: "t_nope" },
    { type: "moveTaskStatus", id: "t_nope", status: "done" },
    { type: "addComment", taskId: "t_nope", body: "x" },
    { type: "updateProject", id: "p_nope", patch: { name: "x" } },
    { type: "deleteProject", id: "p_nope" },
    { type: "updatePost", id: "po_nope", patch: { title: "x" } },
    { type: "deletePost", id: "po_nope" },
    { type: "duplicatePost", id: "po_nope" },
    { type: "addSnapshot", postId: "po_nope", snapshot: { atMinutes: 1, impressions: 1, views: 1, likes: 0, comments: 0, shares: 0, saves: 0 } },
    { type: "removeSnapshot", postId: "po_nope", snapshotId: "x" },
    { type: "removeLabel", id: "l_nope" },
    { type: "restoreTask", id: "t_nope" },
    { type: "restoreProject", id: "p_nope" },
    { type: "restorePost", id: "po_nope" },
    { type: "createTask", data: { projectId: "p_nope", title: "x" } },
  ];
  for (const op of cases) {
    it(`${op.type} on an unknown id throws NotFound`, () => {
      assert.throws(
        () => runOp(seed(), op),
        (e: unknown) => e instanceof OpError && e.code === "NotFound",
      );
    });
  }

  it("snapshot validation surfaces as a Validation error", () => {
    assert.throws(
      () =>
        runOp(seed(), {
          type: "addSnapshot",
          postId: "po_brutalist_drop",
          snapshot: { atMinutes: -1, impressions: 1, views: 1, likes: 0, comments: 0, shares: 0, saves: 0 },
        }),
      (e: unknown) => e instanceof OpError && e.code === "Validation",
    );
  });
});

describe("ops — delete and restore round-trip through the trash", () => {
  it("returns what it deleted and restores from the lookup", () => {
    const state = seed();
    const del = runOp(state, { type: "deleteTask", id: "t_p_web_1" });
    assert.equal(del.deleted?.kind, "task");
    assert.ok(!del.state.tasks.some((t) => t.id === "t_p_web_1"));
    const trash: TrashLookup = {
      task: (id) => (id === "t_p_web_1" ? (del.deleted!.snapshot as Task) : undefined),
      project: () => undefined,
      post: () => undefined,
    };
    const back = runOp(del.state, { type: "restoreTask", id: "t_p_web_1" }, { trash });
    assert.deepEqual(
      back.state.tasks.find((t) => t.id === "t_p_web_1"),
      state.tasks.find((t) => t.id === "t_p_web_1"),
    );
  });

  it("deleting a project cascades its tasks into one snapshot", () => {
    const state = seed();
    const before = state.tasks.filter((t) => t.projectId === "p_web").length;
    const del = runOp(state, { type: "deleteProject", id: "p_web" });
    assert.equal(del.deleted?.kind, "project");
    const snap = del.deleted!.snapshot as { tasks: Task[] };
    assert.equal(snap.tasks.length, before);
    assert.ok(!del.state.tasks.some((t) => t.projectId === "p_web"));
  });

  it("post delete keeps snapshots for the restore", () => {
    const state = seed();
    const post = state.posts[0];
    const del = runOp(state, { type: "deletePost", id: post.id });
    assert.deepEqual((del.deleted!.snapshot as Post).snapshots, post.snapshots);
  });
});

describe("ops — read scopes", () => {
  it("single-record ops scope to their record", () => {
    assert.deepEqual(opScope({ type: "updateTask", id: "t_1", patch: {} }).tasks, { id: "t_1" });
    assert.deepEqual(opScope({ type: "addComment", taskId: "t_1", body: "x" }).tasks, { id: "t_1" });
    assert.deepEqual(opScope({ type: "addSnapshot", postId: "po_1", snapshot: { atMinutes: 1, impressions: 1, views: 1, likes: 0, comments: 0, shares: 0, saves: 0 } }).posts, { id: "po_1" });
    assert.equal(opScope({ type: "updateTask", id: "t_1", patch: {} }).projects, "none");
  });

  it("createTask needs only its project", () => {
    const s = opScope({ type: "createTask", data: { projectId: "p_web", title: "x" } });
    assert.deepEqual(s.projects, { id: "p_web" });
    assert.equal(s.tasks, "none");
  });

  it("cascading ops load what they cascade over", () => {
    assert.deepEqual(opScope({ type: "deleteProject", id: "p_web" }).tasks, { projectId: "p_web" });
    assert.equal(opScope({ type: "removeLabel", id: "l_bug" }).tasks, "all");
  });

  it("a scoped replay yields the same result as a full-state replay", () => {
    // Simulate the server: load only the scoped collections, replay, and
    // compare the touched records against a full-state replay.
    const full = seed();
    const op: Op = { type: "createTask", data: { projectId: "p_app", title: "Scoped" } };
    const ctx = () => seededContext(fixedSeed, { actorId: "u_rob" });
    const scope = opScope(op);
    const partial: WorkspaceState = {
      ...full,
      labels: [],
      projects: full.projects.filter(
        (p) => typeof scope.projects === "object" && "id" in scope.projects && p.id === scope.projects.id,
      ),
      tasks: [],
      posts: [],
    };
    const a = runOp(full, op, ctx());
    const b = runOp(partial, op, ctx());
    assert.deepEqual(a.result, b.result);
    assert.deepEqual(
      a.state.projects.find((p) => p.id === "p_app"),
      b.state.projects.find((p) => p.id === "p_app"),
    );
  });

  it("owner-only ops are the destructive ones", () => {
    assert.ok(OWNER_ONLY_OPS.has("deleteProject"));
    assert.ok(OWNER_ONLY_OPS.has("removeLabel"));
    assert.ok(!OWNER_ONLY_OPS.has("createTask"));
  });
});

describe("ops — clearing fields travels as `unset`", () => {
  it("toWirePatch splits undefined values out of the patch", () => {
    const wire = toWirePatch({ title: "x", assigneeId: undefined, dueDate: undefined });
    assert.deepEqual(wire, { patch: { title: "x" }, unset: ["assigneeId", "dueDate"] });
    assert.deepEqual(toWirePatch({ title: "x" }), { patch: { title: "x" } });
  });

  it("runOp rebuilds the undefineds so the pure mutation clears the field", () => {
    const state = seed();
    const withAssignee = state.tasks.find((t) => t.assigneeId)!;
    const r = runOp(state, { type: "updateTask", id: withAssignee.id, patch: {}, unset: ["assigneeId"] });
    const after = r.state.tasks.find((t) => t.id === withAssignee.id)!;
    assert.equal(after.assigneeId, undefined);
    assert.equal(after.activity.at(-1)!.message, "Unassigned");
  });

  it("rejects clearing a field that is not clearable", () => {
    assert.throws(
      () => runOp(seed(), { type: "updateTask", id: "t_p_web_1", patch: {}, unset: ["title"] }),
      (e: unknown) => e instanceof OpError && e.code === "Validation",
    );
  });
});
