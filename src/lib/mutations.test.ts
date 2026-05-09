import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addSnapshot,
  createPost,
  createProject,
  createTask,
  duplicatePost,
  emptyWorkspace,
  moveTaskStatus,
  updateTask,
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
