import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addComment,
  addLabel,
  addSnapshot,
  addUser,
  createPost,
  createProject,
  createTask,
  deletePost,
  deleteProject,
  deleteTask,
  duplicatePost,
  emptyWorkspace,
  moveTaskStatus,
  removeLabel,
  removeSnapshot,
  removeUser,
  restorePost,
  restoreProject,
  restoreTask,
  setCurrentUser,
  setTheme,
  snapshotProject,
  updatePost,
  updateProject,
  updateTask,
  WORKSPACE_VERSION,
  WorkspaceState,
} from "./mutations";

function fresh(): WorkspaceState {
  return emptyWorkspace();
}

describe("createTask", () => {
  it("uses the project's nextTaskNumber and increments it", () => {
    const s0 = fresh();
    const project = s0.projects[0];
    const r1 = createTask(s0, {
      projectId: project.id,
      title: "first",
    });
    const r2 = createTask(r1.state, {
      projectId: project.id,
      title: "second",
    });
    assert.equal(r1.task.number, project.nextTaskNumber);
    assert.equal(r2.task.number, project.nextTaskNumber + 1);
    const updatedProject = r2.state.projects.find((p) => p.id === project.id);
    assert.equal(updatedProject?.nextTaskNumber, project.nextTaskNumber + 2);
  });

  it("rejects creation against a missing project", () => {
    assert.throws(
      () => createTask(fresh(), { projectId: "nope", title: "x" }),
      /not found/,
    );
  });

  it("logs an activity entry on creation", () => {
    const s0 = fresh();
    const r = createTask(s0, {
      projectId: s0.projects[0].id,
      title: "a",
    });
    assert.equal(r.task.activity.length, 1);
    assert.match(r.task.activity[0].message, /Created/);
  });
});

describe("updateTask", () => {
  it("logs activity entries when status, priority, or assignee change", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const otherUser = s0.users.find((u) => u.id !== task.assigneeId);
    assert.ok(otherUser, "expected a user distinct from the seed assignee");
    const next = updateTask(s0, task.id, {
      status: "done",
      priority: "urgent",
      assigneeId: otherUser!.id,
    });
    const updated = next.tasks.find((t) => t.id === task.id)!;
    const messages = updated.activity.map((a) => a.message);
    assert.ok(messages.some((m) => /Status →/.test(m)));
    assert.ok(messages.some((m) => /Priority →/.test(m)));
    assert.ok(messages.some((m) => /Assigned to @/.test(m)));
  });

  it("no-ops when fields don't change", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const before = task.activity.length;
    const next = updateTask(s0, task.id, {
      status: task.status,
      priority: task.priority,
    });
    const updated = next.tasks.find((t) => t.id === task.id)!;
    assert.equal(updated.activity.length, before);
  });
});

describe("moveTaskStatus", () => {
  it("delegates to updateTask and emits the activity entry", () => {
    const s0 = fresh();
    const t = s0.tasks[0];
    const next = moveTaskStatus(s0, t.id, "done");
    const updated = next.tasks.find((x) => x.id === t.id)!;
    assert.equal(updated.status, "done");
    assert.ok(updated.activity.some((a) => /Status → done/.test(a.message)));
  });
});

describe("createProject", () => {
  it("starts nextTaskNumber at 1", () => {
    const s0 = fresh();
    const r = createProject(s0, { name: "X", key: "XYZ" });
    assert.equal(r.project.nextTaskNumber, 1);
  });
});

describe("createPost / addSnapshot / duplicatePost", () => {
  it("creates with sane defaults", () => {
    const r = createPost(fresh(), { title: "t", platform: "tiktok" });
    assert.equal(r.post.platform, "tiktok");
    assert.equal(r.post.status, "draft");
    assert.equal(r.post.content.format, "video");
    assert.equal(r.post.snapshots.length, 0);
  });

  it("adds snapshots in chronological order", () => {
    const s0 = fresh();
    const post = s0.posts[0];
    const s1 = addSnapshot(s0, post.id, {
      atMinutes: 60,
      impressions: 1000,
      views: 900,
      likes: 50,
      comments: 5,
      shares: 10,
      saves: 2,
    }).state;
    const s2 = addSnapshot(s1, post.id, {
      atMinutes: 5,
      impressions: 100,
      views: 90,
      likes: 5,
      comments: 0,
      shares: 0,
      saves: 0,
    }).state;
    const updated = s2.posts.find((p) => p.id === post.id)!;
    const minutes = updated.snapshots.map((s) => s.atMinutes);
    // Sorted ascending regardless of insertion order.
    assert.deepEqual(
      minutes,
      [...minutes].sort((a, b) => a - b),
    );
  });

  it("duplicate clears snapshots, status, scheduling", () => {
    const s0 = fresh();
    const original = s0.posts.find((p) => p.snapshots.length > 0)!;
    const r = duplicatePost(s0, original.id);
    assert.ok(r.post);
    assert.equal(r.post!.snapshots.length, 0);
    assert.equal(r.post!.status, "draft");
    assert.notEqual(r.post!.id, original.id);
    assert.match(r.post!.title, /\(variant\)$/);
  });
});

// ── New: emptyWorkspace ────────────────────────────────────────────────────

describe("emptyWorkspace", () => {
  it("uses the current WORKSPACE_VERSION", () => {
    assert.equal(emptyWorkspace().version, WORKSPACE_VERSION);
  });

  it("defaults theme to 'system' and picks a current user from seed", () => {
    const s = emptyWorkspace();
    assert.equal(s.theme, "system");
    assert.ok(s.users.find((u) => u.id === s.currentUserId));
  });
});

describe("WORKSPACE_VERSION", () => {
  it("is the integer 1", () => {
    assert.equal(WORKSPACE_VERSION, 1);
    assert.equal(typeof WORKSPACE_VERSION, "number");
  });
});

// ── New: addUser / removeUser cascades ─────────────────────────────────────

describe("addUser / removeUser", () => {
  it("addUser produces a u_ prefixed id and appends to users", () => {
    const s0 = fresh();
    const r = addUser(s0, {
      name: "Test",
      handle: "test",
      color: "#000",
    });
    assert.match(r.user.id, /^u_/);
    assert.equal(r.state.users.length, s0.users.length + 1);
    assert.equal(r.state.users[r.state.users.length - 1].id, r.user.id);
  });

  it("removeUser clears leadId references on every project", () => {
    const s0 = fresh();
    const project = s0.projects.find((p) => p.leadId)!;
    const next = removeUser(s0, project.leadId!);
    const updated = next.projects.find((p) => p.id === project.id)!;
    assert.equal(updated.leadId, undefined);
  });

  it("removeUser strips removed id from project memberIds", () => {
    const s0 = fresh();
    const project = s0.projects.find((p) => p.memberIds.length > 0)!;
    const userId = project.memberIds[0];
    const next = removeUser(s0, userId);
    for (const p of next.projects) {
      assert.ok(!p.memberIds.includes(userId), `${p.id} still has ${userId}`);
    }
  });

  it("removeUser nulls assigneeId on any task assigned to that user", () => {
    const s0 = fresh();
    const assigned = s0.tasks.find((t) => t.assigneeId)!;
    const next = removeUser(s0, assigned.assigneeId!);
    const updated = next.tasks.find((t) => t.id === assigned.id)!;
    assert.equal(updated.assigneeId, undefined);
  });

  it("removeUser is a no-op when the id is unknown", () => {
    const s0 = fresh();
    const next = removeUser(s0, "u_does_not_exist");
    assert.equal(next.users.length, s0.users.length);
  });
});

// ── New: addLabel / removeLabel cascade ────────────────────────────────────

describe("addLabel / removeLabel", () => {
  it("addLabel creates an l_ prefixed id", () => {
    const r = addLabel(fresh(), { name: "Test", color: "#fff" });
    assert.match(r.label.id, /^l_/);
  });

  it("removeLabel strips its id from every task.labelIds", () => {
    const s0 = fresh();
    // Make sure at least one task has labels — pick one from the seed
    const taskWithLabels = s0.tasks.find((t) => t.labelIds.length > 0)!;
    assert.ok(taskWithLabels, "no seed task has labels");
    const labelId = taskWithLabels.labelIds[0];
    const next = removeLabel(s0, labelId);
    for (const t of next.tasks) {
      assert.ok(!t.labelIds.includes(labelId));
    }
    assert.ok(!next.labels.find((l) => l.id === labelId));
  });
});

// ── New: createProject defaults + insertion order ──────────────────────────

describe("createProject (extended)", () => {
  it("defaults icon to first character of name (uppercase)", () => {
    const r = createProject(fresh(), { name: "alpha", key: "ALF" });
    assert.equal(r.project.icon, "A");
  });

  it("prepends new project at head of list (newest-first)", () => {
    const s0 = fresh();
    const r = createProject(s0, { name: "X", key: "X" });
    assert.equal(r.state.projects[0].id, r.project.id);
  });

  it("falls back leadId / memberIds to currentUserId when not provided", () => {
    const s0 = fresh();
    const r = createProject(s0, { name: "X", key: "X" });
    assert.equal(r.project.leadId, s0.currentUserId);
    assert.deepEqual(r.project.memberIds, [s0.currentUserId]);
  });

  it("preserves provided leadId/memberIds/description/icon", () => {
    const s0 = fresh();
    const r = createProject(s0, {
      name: "X",
      key: "X",
      description: "desc",
      icon: "Z",
      leadId: "u_custom",
      memberIds: ["u_a", "u_b"],
    });
    assert.equal(r.project.description, "desc");
    assert.equal(r.project.icon, "Z");
    assert.equal(r.project.leadId, "u_custom");
    assert.deepEqual(r.project.memberIds, ["u_a", "u_b"]);
  });

  it("supplies a default accent (a valid hex) and no targetDate", () => {
    // Assert the contract — there IS a default accent and it's a valid hex
    // color — not the exact brand value, which is editorial and would make
    // this test break on a benign palette tweak.
    const r = createProject(fresh(), { name: "X", key: "X" });
    assert.match(r.project.accent ?? "", /^#[0-9a-f]{6}$/i);
    assert.equal(r.project.targetDate, undefined);
  });

  it("respects a provided accent over the default", () => {
    const r = createProject(fresh(), {
      name: "X",
      key: "X",
      accent: "#abcdef",
    });
    assert.equal(r.project.accent, "#abcdef");
  });
});

describe("no-op mutations on unknown ids", () => {
  it("removeSnapshot is a no-op when snapshotId doesn't match", () => {
    const s0 = fresh();
    const post = s0.posts.find((p) => p.snapshots.length > 0)!;
    const next = removeSnapshot(s0, post.id, "s_nope");
    const updated = next.posts.find((p) => p.id === post.id)!;
    assert.equal(updated.snapshots.length, post.snapshots.length);
  });

  it("removeSnapshot when postId is unknown leaves other posts untouched", () => {
    const s0 = fresh();
    const next = removeSnapshot(s0, "po_nope", "s_nope");
    assert.equal(next.posts.length, s0.posts.length);
    // Posts are deep-cloned via .map, so equality is by content, not identity.
    assert.deepEqual(
      next.posts.map((p) => p.id),
      s0.posts.map((p) => p.id),
    );
  });

  it("addComment for an unknown taskId returns the comment but no state change to other tasks", () => {
    const s0 = fresh();
    const r = addComment(s0, "t_nope", "hi");
    // Comment is built (the function doesn't validate task existence
    // before building the comment object); but the map runs the
    // task-id === clause for every task, so nothing actually changes.
    assert.ok(r.comment);
    assert.equal(r.state.tasks.length, s0.tasks.length);
    for (let i = 0; i < s0.tasks.length; i++) {
      assert.equal(r.state.tasks[i].id, s0.tasks[i].id);
      assert.equal(
        r.state.tasks[i].comments.length,
        s0.tasks[i].comments.length,
      );
    }
  });
});

// ── New: updateProject / deleteProject ─────────────────────────────────────

describe("updateProject", () => {
  it("merges patch and bumps updatedAt", async () => {
    const s0 = fresh();
    const project = s0.projects[0];
    const originalUpdated = project.updatedAt;
    // Give the clock a single tick so the ISO timestamps differ
    await new Promise((r) => setTimeout(r, 5));
    const next = updateProject(s0, project.id, { description: "new" });
    const updated = next.projects.find((p) => p.id === project.id)!;
    assert.equal(updated.description, "new");
    assert.notEqual(updated.updatedAt, originalUpdated);
  });

  it("is a no-op for unknown id", () => {
    const s0 = fresh();
    const next = updateProject(s0, "p_nope", { description: "nope" });
    assert.deepEqual(
      next.projects.map((p) => p.id),
      s0.projects.map((p) => p.id),
    );
  });
});

describe("deleteProject", () => {
  it("removes the project AND cascades to its tasks", () => {
    const s0 = fresh();
    const project = s0.projects.find((p) =>
      s0.tasks.some((t) => t.projectId === p.id),
    )!;
    const before = s0.tasks.filter((t) => t.projectId === project.id).length;
    assert.ok(before > 0, "no tasks in this project to cascade-delete");
    const next = deleteProject(s0, project.id);
    assert.ok(!next.projects.find((p) => p.id === project.id));
    assert.equal(
      next.tasks.filter((t) => t.projectId === project.id).length,
      0,
    );
  });

  it("leaves tasks in other projects untouched", () => {
    const s0 = fresh();
    const target = s0.projects[0].id;
    const otherCount = s0.tasks.filter((t) => t.projectId !== target).length;
    const next = deleteProject(s0, target);
    assert.equal(next.tasks.length, otherCount);
  });
});

// ── New: createTask defaults, ID prefix, order, isolation ─────────────────

describe("createTask (extended)", () => {
  it("uses t_ prefix and defaults type/status/priority/labelIds", () => {
    const s0 = fresh();
    const r = createTask(s0, { projectId: s0.projects[0].id, title: "x" });
    assert.match(r.task.id, /^t_/);
    assert.equal(r.task.type, "task");
    assert.equal(r.task.status, "todo");
    assert.equal(r.task.priority, "medium");
    assert.deepEqual(r.task.labelIds, []);
  });

  it("prepends the new task at head of state.tasks", () => {
    const s0 = fresh();
    const r = createTask(s0, { projectId: s0.projects[0].id, title: "x" });
    assert.equal(r.state.tasks[0].id, r.task.id);
  });

  it("only increments nextTaskNumber on the matching project", () => {
    const s0 = fresh();
    const [a, b] = s0.projects;
    const before = { a: a.nextTaskNumber, b: b.nextTaskNumber };
    const r = createTask(s0, { projectId: a.id, title: "x" });
    const aAfter = r.state.projects.find((p) => p.id === a.id)!;
    const bAfter = r.state.projects.find((p) => p.id === b.id)!;
    assert.equal(aAfter.nextTaskNumber, before.a + 1);
    assert.equal(bAfter.nextTaskNumber, before.b);
  });

  it("activity message uses provided task type", () => {
    const s0 = fresh();
    const r = createTask(s0, {
      projectId: s0.projects[0].id,
      title: "x",
      type: "issue",
    });
    assert.match(r.task.activity[0].message, /Created issue/);
  });

  it("honors ctx.actorId for activity attribution", () => {
    const s0 = fresh();
    const r = createTask(
      s0,
      { projectId: s0.projects[0].id, title: "x" },
      { actorId: "u_actor" },
    );
    assert.equal(r.task.activity[0].authorId, "u_actor");
  });
});

// ── New: updateTask edge branches ──────────────────────────────────────────

describe("updateTask (extended)", () => {
  it("is a no-op for a missing task", () => {
    const s0 = fresh();
    const next = updateTask(s0, "t_nope", { status: "done" });
    assert.deepEqual(next, s0);
  });

  it("explicit assigneeId=null emits an 'Unassigned' activity entry", () => {
    const s0 = fresh();
    const task = s0.tasks.find((t) => t.assigneeId)!;
    const next = updateTask(s0, task.id, { assigneeId: null } as any);
    const updated = next.tasks.find((t) => t.id === task.id)!;
    // The wire contract (mutations.ts:258-260): null clears the assignment.
    // The mutation spreads the patch so the field is persisted as null;
    // either way it no longer points at a known user.
    assert.equal(updated.assigneeId ?? undefined, undefined);
    assert.ok(updated.activity.some((a) => /Unassigned/.test(a.message)));
  });

  it("falls back to the raw id when the assigned user is unknown", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const next = updateTask(s0, task.id, { assigneeId: "u_unknown" });
    const updated = next.tasks.find((t) => t.id === task.id)!;
    assert.ok(updated.activity.some((a) => /Assigned to u_unknown/.test(a.message)));
  });

  it("uses ctx.actorId on activity entries when provided", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const next = updateTask(
      s0,
      task.id,
      { status: "done" },
      { actorId: "u_actor" },
    );
    const updated = next.tasks.find((t) => t.id === task.id)!;
    const entry = updated.activity[updated.activity.length - 1];
    assert.equal(entry.authorId, "u_actor");
  });

  it("uses '@handle' format when assigning to a known user", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const otherUser = s0.users.find((u) => u.id !== task.assigneeId)!;
    const next = updateTask(s0, task.id, { assigneeId: otherUser.id });
    const updated = next.tasks.find((t) => t.id === task.id)!;
    assert.ok(
      updated.activity.some((a) =>
        a.message.includes(`Assigned to @${otherUser.handle}`),
      ),
    );
  });
});

// ── New: deleteTask ────────────────────────────────────────────────────────

describe("deleteTask", () => {
  it("removes the task and leaves others alone", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const next = deleteTask(s0, task.id);
    assert.equal(next.tasks.length, s0.tasks.length - 1);
    assert.ok(!next.tasks.find((t) => t.id === task.id));
  });
});

// ── New: addComment ────────────────────────────────────────────────────────

describe("addComment", () => {
  it("appends comment and a 'Commented' activity entry", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const r = addComment(s0, task.id, "hello");
    assert.ok(r.comment);
    const updated = r.state.tasks.find((t) => t.id === task.id)!;
    assert.equal(updated.comments.length, task.comments.length + 1);
    assert.ok(updated.activity.some((a) => a.message === "Commented"));
  });

  it("short-circuits empty/whitespace bodies (no comment, no state change)", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const r1 = addComment(s0, task.id, "");
    const r2 = addComment(s0, task.id, "   \n  ");
    assert.equal(r1.comment, undefined);
    assert.equal(r2.comment, undefined);
    assert.deepEqual(r1.state, s0);
    assert.deepEqual(r2.state, s0);
  });

  it("trims comment body before storage", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const r = addComment(s0, task.id, "  hello  ");
    assert.equal(r.comment!.body, "hello");
  });
});

// ── New: createPost defaults + duplicatePost ──────────────────────────────

describe("createPost (extended)", () => {
  it("uses po_ prefix and prepends to posts", () => {
    const s0 = fresh();
    const r = createPost(s0, { title: "x", platform: "tiktok" });
    assert.match(r.post.id, /^po_/);
    assert.equal(r.state.posts[0].id, r.post.id);
  });

  it("provides a default threshold of 100k views over 7d", () => {
    const r = createPost(fresh(), { title: "x", platform: "tiktok" });
    assert.deepEqual(r.post.threshold, {
      metric: "views",
      value: 100_000,
      window: "7d",
    });
  });

  it("provides default content + context blocks", () => {
    const r = createPost(fresh(), { title: "x", platform: "linkedin" });
    assert.equal(r.post.content.format, "video");
    assert.equal(r.post.content.hasTrendingAudio, false);
    assert.equal(r.post.context.sentiment, "neutral");
  });
});

describe("duplicatePost (extended)", () => {
  it("returns post: undefined for unknown id and leaves state alone", () => {
    const s0 = fresh();
    const r = duplicatePost(s0, "po_nope");
    assert.equal(r.post, undefined);
    assert.deepEqual(r.state, s0);
  });

  it("honors a custom titleSuffix and trims the result", () => {
    const s0 = fresh();
    const original = s0.posts[0];
    const r = duplicatePost(s0, original.id, { titleSuffix: "" });
    assert.equal(r.post!.title, original.title);
  });

  it("default titleSuffix is ' (variant)'", () => {
    const s0 = fresh();
    const original = s0.posts[0];
    const r = duplicatePost(s0, original.id);
    assert.equal(r.post!.title, `${original.title} (variant)`);
  });
});

// ── New: updatePost / deletePost ──────────────────────────────────────────

describe("updatePost", () => {
  it("merges patch and bumps updatedAt", async () => {
    const s0 = fresh();
    const post = s0.posts[0];
    const before = post.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const next = updatePost(s0, post.id, { title: "renamed" });
    const updated = next.posts.find((p) => p.id === post.id)!;
    assert.equal(updated.title, "renamed");
    assert.notEqual(updated.updatedAt, before);
  });
});

describe("deletePost", () => {
  it("removes the post", () => {
    const s0 = fresh();
    const post = s0.posts[0];
    const next = deletePost(s0, post.id);
    assert.ok(!next.posts.find((p) => p.id === post.id));
  });
});

// ── New: addSnapshot validation ───────────────────────────────────────────

describe("addSnapshot validation", () => {
  function baseSnap(overrides: Record<string, any> = {}) {
    return {
      atMinutes: 60,
      impressions: 1000,
      views: 950,
      likes: 50,
      comments: 5,
      shares: 10,
      saves: 2,
      ...overrides,
    } as any;
  }

  for (const field of [
    "atMinutes",
    "impressions",
    "views",
    "likes",
    "comments",
    "shares",
    "saves",
  ]) {
    it(`rejects negative ${field}`, () => {
      const s0 = fresh();
      const post = s0.posts[0];
      assert.throws(
        () => addSnapshot(s0, post.id, baseSnap({ [field]: -1 })),
        /must be a finite non-negative/,
      );
    });

    it(`rejects NaN ${field}`, () => {
      const s0 = fresh();
      const post = s0.posts[0];
      assert.throws(
        () => addSnapshot(s0, post.id, baseSnap({ [field]: NaN })),
        /must be a finite non-negative/,
      );
    });

    it(`rejects Infinity ${field}`, () => {
      const s0 = fresh();
      const post = s0.posts[0];
      assert.throws(
        () => addSnapshot(s0, post.id, baseSnap({ [field]: Infinity })),
        /must be a finite non-negative/,
      );
    });

    it(`requires ${field} (rejects null)`, () => {
      const s0 = fresh();
      const post = s0.posts[0];
      assert.throws(
        () => addSnapshot(s0, post.id, baseSnap({ [field]: null })),
        new RegExp(`${field} is required`),
      );
    });
  }

  it("allows retentionPct in 0..100", () => {
    const s0 = fresh();
    const post = s0.posts[0];
    const r1 = addSnapshot(s0, post.id, baseSnap({ retentionPct: 0 }));
    const r2 = addSnapshot(r1.state, post.id, baseSnap({ retentionPct: 100 }));
    assert.equal(r2.snapshot.retentionPct, 100);
  });

  it("rejects retentionPct > 100", () => {
    const s0 = fresh();
    const post = s0.posts[0];
    assert.throws(
      () => addSnapshot(s0, post.id, baseSnap({ retentionPct: 120 })),
      /retentionPct must be in 0\.\.100/,
    );
  });

  it("accepts omitted retentionPct / watchTimeAvgSec (optional)", () => {
    const s0 = fresh();
    const post = s0.posts[0];
    const r = addSnapshot(s0, post.id, baseSnap()); // neither field set
    assert.ok(r.snapshot);
  });

  it("rejects negative watchTimeAvgSec", () => {
    const s0 = fresh();
    const post = s0.posts[0];
    assert.throws(
      () => addSnapshot(s0, post.id, baseSnap({ watchTimeAvgSec: -1 })),
      /watchTimeAvgSec must be a finite non-negative/,
    );
  });
});

// ── New: removeSnapshot ───────────────────────────────────────────────────

describe("removeSnapshot", () => {
  it("removes the snapshot from the target post and bumps updatedAt", async () => {
    const s0 = fresh();
    // Add a snapshot we can later remove.
    const post = s0.posts[0];
    const r1 = addSnapshot(s0, post.id, {
      atMinutes: 5,
      impressions: 1,
      views: 1,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
    });
    const before = r1.state.posts.find((p) => p.id === post.id)!.snapshots.length;
    await new Promise((r) => setTimeout(r, 5));
    const next = removeSnapshot(r1.state, post.id, r1.snapshot.id);
    const updated = next.posts.find((p) => p.id === post.id)!;
    assert.equal(updated.snapshots.length, before - 1);
    assert.ok(!updated.snapshots.find((s) => s.id === r1.snapshot.id));
    assert.notEqual(updated.updatedAt, post.updatedAt);
  });
});

// ── New: setTheme / setCurrentUser ────────────────────────────────────────

describe("setTheme / setCurrentUser", () => {
  it("setTheme replaces the theme", () => {
    const s0 = fresh();
    assert.equal(setTheme(s0, "dark").theme, "dark");
  });

  it("setCurrentUser replaces the currentUserId", () => {
    const s0 = fresh();
    assert.equal(setCurrentUser(s0, "u_x").currentUserId, "u_x");
  });

  it("setTheme returns a new state object (immutability)", () => {
    const s0 = fresh();
    const s1 = setTheme(s0, "dark");
    assert.notEqual(s1, s0);
    assert.equal(s0.theme, "system"); // original unchanged
  });
});

describe("moveTaskStatus (extended)", () => {
  it("is a no-op when taskId is unknown (updateTask delegates)", () => {
    const s0 = fresh();
    const next = moveTaskStatus(s0, "t_nope", "done");
    // updateTask returns state unchanged when task is missing.
    assert.deepEqual(next, s0);
  });

  it("updates the status to the target value", () => {
    const s0 = fresh();
    const task = s0.tasks.find((t) => t.status !== "in_review")!;
    const next = moveTaskStatus(s0, task.id, "in_review");
    const updated = next.tasks.find((t) => t.id === task.id)!;
    assert.equal(updated.status, "in_review");
  });
});

describe("createTask sequential numbering", () => {
  it("sequential creates get consecutive task numbers per project", () => {
    let s = fresh();
    const projectId = s.projects[0].id;
    const before = s.projects.find((p) => p.id === projectId)!.nextTaskNumber;
    const numbers: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = createTask(s, { projectId, title: `seq ${i}` });
      numbers.push(r.task.number);
      s = r.state;
    }
    assert.deepEqual(numbers, [before, before + 1, before + 2, before + 3, before + 4]);
  });
});

// ── Undo / restore ─────────────────────────────────────────────────────────
//
// These guard the ADHD-UX "undo a destructive click" path. One mis-click on
// a project would otherwise wipe every child task with no way back.

describe("restoreProject", () => {
  it("brings back the project AND all N cascaded tasks with IDs intact", () => {
    const s0 = fresh();
    const project = s0.projects.find((p) =>
      s0.tasks.some((t) => t.projectId === p.id),
    )!;
    const childTasks = s0.tasks.filter((t) => t.projectId === project.id);
    assert.ok(childTasks.length > 0, "fixture must have child tasks");

    const snapshot = snapshotProject(s0, project.id)!;
    assert.equal(snapshot.tasks.length, childTasks.length);

    const deleted = deleteProject(s0, project.id);
    const restored = restoreProject(deleted, snapshot);

    // Project is back, same ID + timestamps.
    const back = restored.projects.find((p) => p.id === project.id);
    assert.ok(back, "project should be restored");
    assert.equal(back!.id, project.id);
    assert.equal(back!.createdAt, project.createdAt);
    assert.equal(back!.nextTaskNumber, project.nextTaskNumber);

    // Every child task is back with original IDs intact.
    const backTaskIds = new Set(
      restored.tasks.filter((t) => t.projectId === project.id).map((t) => t.id),
    );
    for (const t of childTasks) {
      assert.ok(backTaskIds.has(t.id), `task ${t.id} should be restored`);
    }
    assert.equal(backTaskIds.size, childTasks.length);
  });

  it("is a no-op if the project is already present (no duplicate IDs)", () => {
    const s0 = fresh();
    const project = s0.projects[0];
    const snapshot = snapshotProject(s0, project.id)!;
    const restored = restoreProject(s0, snapshot);
    const matching = restored.projects.filter((p) => p.id === project.id);
    assert.equal(matching.length, 1);
  });

  it("leaves unrelated tasks untouched", () => {
    const s0 = fresh();
    const target = s0.projects[0];
    const snapshot = snapshotProject(s0, target.id)!;
    const deleted = deleteProject(s0, target.id);
    const otherIds = deleted.tasks.map((t) => t.id).sort();
    const restored = restoreProject(deleted, snapshot);
    const stillThere = restored.tasks
      .filter((t) => t.projectId !== target.id)
      .map((t) => t.id)
      .sort();
    assert.deepEqual(stillThere, otherIds);
  });
});

describe("restoreTask", () => {
  it("brings back the deleted task with original ID and activity intact", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const deleted = deleteTask(s0, task.id);
    assert.ok(!deleted.tasks.find((t) => t.id === task.id));

    const restored = restoreTask(deleted, task);
    const back = restored.tasks.find((t) => t.id === task.id);
    assert.ok(back, "task should be restored");
    assert.equal(back!.id, task.id);
    assert.equal(back!.createdAt, task.createdAt);
    assert.deepEqual(back!.activity, task.activity);
  });

  it("is a no-op if a task with the same ID already exists", () => {
    const s0 = fresh();
    const task = s0.tasks[0];
    const restored = restoreTask(s0, task);
    const matching = restored.tasks.filter((t) => t.id === task.id);
    assert.equal(matching.length, 1);
  });
});

describe("restorePost", () => {
  it("brings back the deleted post with snapshots and timestamps intact", () => {
    const s0 = fresh();
    const post = s0.posts[0];
    const deleted = deletePost(s0, post.id);
    assert.ok(!deleted.posts.find((p) => p.id === post.id));

    const restored = restorePost(deleted, post);
    const back = restored.posts.find((p) => p.id === post.id);
    assert.ok(back, "post should be restored");
    assert.equal(back!.id, post.id);
    assert.equal(back!.createdAt, post.createdAt);
    assert.deepEqual(back!.snapshots, post.snapshots);
  });

  it("is a no-op if a post with the same ID already exists", () => {
    const s0 = fresh();
    const post = s0.posts[0];
    const restored = restorePost(s0, post);
    const matching = restored.posts.filter((p) => p.id === post.id);
    assert.equal(matching.length, 1);
  });
});
