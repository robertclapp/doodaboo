import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDocumentSize } from "convex/values";
import { checkRecord, LIMITS, recordBytes } from "./limits";
import { emptyWorkspace } from "./mutations";

const ws = emptyWorkspace({ demoPosts: true });

describe("cloud size limits", () => {
  it("every seed record is well inside the limits", () => {
    for (const l of ws.labels) assert.equal(checkRecord("labels", l), null);
    for (const p of ws.projects) assert.equal(checkRecord("projects", p), null);
    for (const t of ws.tasks) assert.equal(checkRecord("tasks", t), null);
    for (const p of ws.posts) assert.equal(checkRecord("posts", p), null);
  });

  it("names the first field over its cap", () => {
    const task = ws.tasks[0];
    assert.match(checkRecord("tasks", { ...task, title: "x".repeat(LIMITS.task.title + 1) }) ?? "", /title is too long/);
    assert.match(
      checkRecord("tasks", { ...task, description: "x".repeat(LIMITS.task.description + 1) }) ?? "",
      /description is too long/,
    );
    assert.match(
      checkRecord("tasks", {
        ...task,
        comments: [{ id: "c", authorId: "u", body: "x".repeat(LIMITS.task.commentBody + 1), createdAt: "" }],
      }) ?? "",
      /A comment is too long/,
    );
    const post = ws.posts[0];
    assert.match(
      checkRecord("posts", { ...post, content: { ...post.content, transcript: "x".repeat(LIMITS.post.transcript + 1) } }) ?? "",
      /transcript is too long/,
    );
    assert.match(
      checkRecord("posts", { ...post, content: { ...post.content, hashtags: Array(LIMITS.post.hashtags + 1).fill("a") } }) ?? "",
      /Hashtags/,
    );
    assert.match(checkRecord("labels", { ...ws.labels[0], name: "x".repeat(LIMITS.label.name + 1) }) ?? "", /label name/);
    assert.match(checkRecord("projects", { ...ws.projects[0], key: "x".repeat(LIMITS.project.key + 1) }) ?? "", /project key/);
  });

  it("checks the whole record against the byte budget even when every field fits", () => {
    const task = ws.tasks[0];
    const comments = Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, authorId: "u", body: "y".repeat(1000), createdAt: "" }));
    assert.match(checkRecord("tasks", { ...task, comments }) ?? "", /too large to store/);
  });

  it("measures records the way Convex does", () => {
    // getDocumentSize adds the system fields (_id, _creationTime) on top of the body.
    const task = ws.tasks[0];
    const body = recordBytes(task);
    assert.ok(body > 0);
    assert.ok(getDocumentSize(task as never) > body);
    assert.ok(getDocumentSize(task as never) - body < 100);
  });
});
