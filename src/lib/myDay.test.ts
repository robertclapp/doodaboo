import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMyDay, MY_DAY_LIMIT, MY_DAY_STATUSES } from "./myDay";
import { Priority, Status, Task } from "./types";

// Minimal task factory — only the fields buildMyDay touches matter; the
// rest stay constant so individual cases stay readable. Order of args is
// stable so callers don't have to remember property names for each case.
function t(
  id: string,
  opts: {
    priority?: Priority;
    status?: Status;
    // Explicit-undefined-clears: pass `assigneeId: undefined` to mean
    // "unassigned" rather than "use the default". `??` would collapse the
    // two, hiding the assignee-filter test case.
    assigneeId?: string;
    dueDate?: string;
  } = {},
): Task {
  const assigneeId = Object.prototype.hasOwnProperty.call(opts, "assigneeId")
    ? opts.assigneeId
    : "u_me";
  return {
    id,
    projectId: "p_test",
    number: 1,
    type: "task",
    title: `task ${id}`,
    description: "",
    status: opts.status ?? "todo",
    priority: opts.priority ?? "medium",
    assigneeId,
    labelIds: [],
    dueDate: opts.dueDate,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    comments: [],
    activity: [],
  };
}

describe("MY_DAY_STATUSES", () => {
  it("matches the CLI dash contract: todo, in_progress, in_review only", () => {
    assert.equal(MY_DAY_STATUSES.size, 3);
    for (const s of ["todo", "in_progress", "in_review"] as const) {
      assert.ok(MY_DAY_STATUSES.has(s), `${s} should be active`);
    }
    for (const s of ["backlog", "done", "cancelled"] as const) {
      assert.ok(!MY_DAY_STATUSES.has(s), `${s} should be excluded`);
    }
  });
});

describe("buildMyDay", () => {
  it("orders by priority urgent → none", () => {
    const tasks: Task[] = [
      t("a", { priority: "none" }),
      t("b", { priority: "low" }),
      t("c", { priority: "urgent" }),
      t("d", { priority: "medium" }),
      t("e", { priority: "high" }),
    ];
    const out = buildMyDay(tasks, "u_me");
    assert.deepEqual(
      out.map((x) => x.id),
      ["c", "e", "d", "b", "a"],
    );
  });

  it("breaks priority ties by sooner due date", () => {
    const tasks: Task[] = [
      t("late", { priority: "high", dueDate: "2026-05-10T00:00:00.000Z" }),
      t("early", { priority: "high", dueDate: "2026-05-01T00:00:00.000Z" }),
      t("mid", { priority: "high", dueDate: "2026-05-05T00:00:00.000Z" }),
    ];
    const out = buildMyDay(tasks, "u_me");
    assert.deepEqual(
      out.map((x) => x.id),
      ["early", "mid", "late"],
    );
  });

  it("sinks tasks without a due date below dated peers in the same bucket", () => {
    const tasks: Task[] = [
      t("nodate", { priority: "high" }),
      t("dated", { priority: "high", dueDate: "2026-05-10T00:00:00.000Z" }),
    ];
    const out = buildMyDay(tasks, "u_me");
    assert.deepEqual(
      out.map((x) => x.id),
      ["dated", "nodate"],
    );
  });

  it("filters out statuses outside MY_DAY_STATUSES", () => {
    const tasks: Task[] = [
      t("a", { status: "todo" }),
      t("b", { status: "in_progress" }),
      t("c", { status: "in_review" }),
      t("d", { status: "backlog" }),
      t("e", { status: "done" }),
      t("f", { status: "cancelled" }),
    ];
    const out = buildMyDay(tasks, "u_me");
    assert.deepEqual(
      out.map((x) => x.id).sort(),
      ["a", "b", "c"],
    );
  });

  it("filters out tasks not assigned to the current user", () => {
    const tasks: Task[] = [
      t("mine", { assigneeId: "u_me" }),
      t("theirs", { assigneeId: "u_other" }),
      t("noone", { assigneeId: undefined }),
    ];
    const out = buildMyDay(tasks, "u_me");
    assert.deepEqual(
      out.map((x) => x.id),
      ["mine"],
    );
  });

  it("caps at the limit (default 5)", () => {
    const tasks: Task[] = Array.from({ length: 10 }, (_, i) =>
      t(`x${i}`, { priority: "high" }),
    );
    const out = buildMyDay(tasks, "u_me");
    assert.equal(out.length, MY_DAY_LIMIT);
    assert.equal(out.length, 5);
  });

  it("respects a custom limit", () => {
    const tasks: Task[] = Array.from({ length: 10 }, (_, i) =>
      t(`x${i}`, { priority: "high" }),
    );
    assert.equal(buildMyDay(tasks, "u_me", 2).length, 2);
    assert.equal(buildMyDay(tasks, "u_me", 0).length, 0);
  });

  it("returns [] when there is no current user", () => {
    const tasks: Task[] = [t("a"), t("b")];
    assert.deepEqual(buildMyDay(tasks, undefined), []);
  });

  it("does not mutate the input array order", () => {
    const tasks: Task[] = [
      t("low", { priority: "low" }),
      t("urgent", { priority: "urgent" }),
    ];
    const before = tasks.map((x) => x.id);
    buildMyDay(tasks, "u_me");
    const after = tasks.map((x) => x.id);
    assert.deepEqual(after, before);
  });
});
