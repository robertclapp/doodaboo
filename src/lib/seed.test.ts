import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  seedLabels,
  seedPosts,
  seedProjects,
  seedTasks,
  seedUsers,
} from "./seed";

describe("seed determinism", () => {
  it("uses fixed-EPOCH timestamps (every ISO string is well-formed)", () => {
    const samples = [seedProjects[0].createdAt, seedTasks[0].createdAt];
    for (const s of samples) {
      assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it("seed timestamps are pinned (not drifting with Date.now)", () => {
    // The EPOCH constant in seed.ts is 2026-04-01. Sampled timestamps
    // should be within a small offset of that anchor; if anyone replaces
    // EPOCH with Date.now() this test breaks.
    const anchor = Date.parse("2026-04-01T00:00:00.000Z");
    for (const t of seedTasks) {
      const dt = Date.parse(t.createdAt);
      assert.ok(
        Math.abs(dt - anchor) < 365 * 24 * 60 * 60 * 1000,
        `task ${t.id} timestamp drifted: ${t.createdAt}`,
      );
    }
  });
});

describe("seedUsers / seedLabels integrity", () => {
  it("user ids are unique and u_-prefixed", () => {
    const ids = new Set(seedUsers.map((u) => u.id));
    assert.equal(ids.size, seedUsers.length);
    for (const u of seedUsers) assert.match(u.id, /^u_/);
  });

  it("label ids are unique and l_-prefixed", () => {
    const ids = new Set(seedLabels.map((l) => l.id));
    assert.equal(ids.size, seedLabels.length);
    for (const l of seedLabels) assert.match(l.id, /^l_/);
  });
});

describe("seedProjects referential integrity", () => {
  it("every project's leadId resolves to a seed user", () => {
    const userIds = new Set(seedUsers.map((u) => u.id));
    for (const p of seedProjects) {
      assert.ok(
        p.leadId === undefined || userIds.has(p.leadId),
        `project ${p.id} has unknown leadId ${p.leadId}`,
      );
    }
  });

  it("every memberId resolves to a seed user", () => {
    const userIds = new Set(seedUsers.map((u) => u.id));
    for (const p of seedProjects) {
      for (const m of p.memberIds) {
        assert.ok(userIds.has(m), `project ${p.id} has unknown member ${m}`);
      }
    }
  });

  it("nextTaskNumber exceeds the highest task number in the project", () => {
    for (const p of seedProjects) {
      const max = Math.max(
        0,
        ...seedTasks.filter((t) => t.projectId === p.id).map((t) => t.number),
      );
      assert.ok(
        p.nextTaskNumber > max,
        `project ${p.id} nextTaskNumber=${p.nextTaskNumber} but max task #=${max}`,
      );
    }
  });
});

describe("seedTasks referential integrity", () => {
  it("every task's projectId resolves to a seed project", () => {
    const projectIds = new Set(seedProjects.map((p) => p.id));
    for (const t of seedTasks) {
      assert.ok(projectIds.has(t.projectId), `task ${t.id} unknown project`);
    }
  });

  it("every assigneeId (when present) resolves to a seed user", () => {
    const userIds = new Set(seedUsers.map((u) => u.id));
    for (const t of seedTasks) {
      if (t.assigneeId) {
        assert.ok(userIds.has(t.assigneeId), `task ${t.id} unknown assignee`);
      }
    }
  });

  it("every labelId resolves to a seed label", () => {
    const labelIds = new Set(seedLabels.map((l) => l.id));
    for (const t of seedTasks) {
      for (const l of t.labelIds) {
        assert.ok(labelIds.has(l), `task ${t.id} unknown label ${l}`);
      }
    }
  });

  it("per-project task numbers are unique", () => {
    const groups: Record<string, Set<number>> = {};
    for (const t of seedTasks) {
      groups[t.projectId] ??= new Set();
      assert.ok(
        !groups[t.projectId].has(t.number),
        `duplicate ${t.projectId}-${t.number}`,
      );
      groups[t.projectId].add(t.number);
    }
  });
});

describe("seedPosts integrity", () => {
  it("post snapshots are sorted by atMinutes (UI assumption)", () => {
    for (const p of seedPosts) {
      const mins = p.snapshots.map((s) => s.atMinutes);
      assert.deepEqual(
        mins,
        [...mins].sort((a, b) => a - b),
        `snapshots not sorted on ${p.id}`,
      );
    }
  });

  it("all engagement metrics are finite and non-negative", () => {
    for (const p of seedPosts) {
      for (const s of p.snapshots) {
        for (const k of [
          "atMinutes",
          "impressions",
          "views",
          "likes",
          "comments",
          "shares",
          "saves",
        ] as const) {
          const v = s[k];
          assert.ok(
            Number.isFinite(v) && v >= 0,
            `bad ${k}=${v} on ${p.id}`,
          );
        }
        if (s.retentionPct != null) {
          assert.ok(s.retentionPct >= 0 && s.retentionPct <= 100);
        }
      }
    }
  });

  it("every post has a valid threshold metric/window", () => {
    for (const p of seedPosts) {
      assert.ok(["views", "shares", "engagement_rate"].includes(p.threshold.metric));
      assert.ok(["24h", "7d", "30d"].includes(p.threshold.window));
    }
  });

  it("post ids are unique and po_-prefixed", () => {
    const ids = new Set(seedPosts.map((p) => p.id));
    assert.equal(ids.size, seedPosts.length);
    for (const p of seedPosts) {
      assert.match(p.id, /^po_/);
    }
  });

  it("video posts on tiktok/reels have hasTrendingAudio=true", () => {
    for (const p of seedPosts) {
      if (
        p.content.format === "video" &&
        (p.platform === "tiktok" || p.platform === "reels")
      ) {
        assert.equal(
          p.content.hasTrendingAudio,
          true,
          `${p.id} should have hasTrendingAudio=true`,
        );
      }
    }
  });

  it("non-video posts do NOT have hasTrendingAudio=true", () => {
    for (const p of seedPosts) {
      if (p.content.format !== "video" && p.content.format !== "live") {
        assert.equal(
          p.content.hasTrendingAudio,
          false,
          `${p.id} has unexpected hasTrendingAudio=true`,
        );
      }
    }
  });

  it("each post has valid content fields (hook, caption, hashtags array)", () => {
    for (const p of seedPosts) {
      assert.equal(typeof p.content.hook, "string");
      assert.equal(typeof p.content.caption, "string");
      assert.ok(Array.isArray(p.content.hashtags));
    }
  });
});

// ── Additional seed integrity checks ───────────────────────────────────────

describe("seedTasks — activity entries", () => {
  it("every task has at least one activity entry", () => {
    for (const t of seedTasks) {
      assert.ok(t.activity.length >= 1, `task ${t.id} has no activity`);
    }
  });

  it("all task ids are unique across all projects", () => {
    const ids = new Set(seedTasks.map((t) => t.id));
    assert.equal(ids.size, seedTasks.length, "duplicate task id found");
  });

  it("all task statuses are valid", () => {
    const validStatuses = new Set(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]);
    for (const t of seedTasks) {
      assert.ok(validStatuses.has(t.status), `invalid status '${t.status}' on ${t.id}`);
    }
  });

  it("all task priorities are valid", () => {
    const validPriorities = new Set(["none", "low", "medium", "high", "urgent"]);
    for (const t of seedTasks) {
      assert.ok(validPriorities.has(t.priority), `invalid priority '${t.priority}' on ${t.id}`);
    }
  });

  it("all task types are 'task' or 'issue'", () => {
    for (const t of seedTasks) {
      assert.ok(["task", "issue"].includes(t.type), `invalid type '${t.type}' on ${t.id}`);
    }
  });
});

describe("seedUsers — required fields", () => {
  it("every user has a non-empty handle", () => {
    for (const u of seedUsers) {
      assert.ok(u.handle.length > 0, `empty handle on ${u.id}`);
    }
  });

  it("every user has a hex color", () => {
    for (const u of seedUsers) {
      assert.match(u.color, /^#[0-9a-fA-F]{6}$/, `invalid color on ${u.id}`);
    }
  });

  it("handles are unique", () => {
    const handles = new Set(seedUsers.map((u) => u.handle));
    assert.equal(handles.size, seedUsers.length);
  });
});

describe("seedProjects — fields", () => {
  it("all project ids are unique", () => {
    const ids = new Set(seedProjects.map((p) => p.id));
    assert.equal(ids.size, seedProjects.length);
  });

  it("all project keys are unique", () => {
    const keys = new Set(seedProjects.map((p) => p.key));
    assert.equal(keys.size, seedProjects.length);
  });

  it("all project statuses are valid", () => {
    const validStatuses = new Set(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]);
    for (const p of seedProjects) {
      assert.ok(validStatuses.has(p.status), `invalid status '${p.status}' on ${p.id}`);
    }
  });

  it("every project has an icon and accent color", () => {
    for (const p of seedProjects) {
      assert.ok(p.icon && p.icon.length > 0, `missing icon on ${p.id}`);
      assert.match(p.accent || "", /^#/, `invalid accent on ${p.id}`);
    }
  });
});
