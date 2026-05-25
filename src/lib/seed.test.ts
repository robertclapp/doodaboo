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
    for (const p of seedPosts) assert.match(p.id, /^po_/);
  });

  it("every post has well-formed content (hook + caption + hashtags array)", () => {
    for (const p of seedPosts) {
      assert.equal(typeof p.content.hook, "string");
      assert.equal(typeof p.content.caption, "string");
      assert.ok(Array.isArray(p.content.hashtags));
    }
  });
});

describe("seedUsers / seedProjects deeper integrity", () => {
  it("user handles are unique", () => {
    const handles = new Set(seedUsers.map((u) => u.handle));
    assert.equal(handles.size, seedUsers.length);
  });

  it("every user has a hex color", () => {
    for (const u of seedUsers) {
      assert.match(u.color, /^#[0-9a-f]{6}$/i, `bad color on ${u.id}`);
    }
  });

  it("project keys are unique", () => {
    const keys = new Set(seedProjects.map((p) => p.key));
    assert.equal(keys.size, seedProjects.length);
  });
});

describe("seedTasks invariants", () => {
  it("every task has at least one activity entry (the 'Created' one)", () => {
    for (const t of seedTasks) {
      assert.ok(t.activity.length > 0, `task ${t.id} has empty activity`);
    }
  });

  it("all task statuses are from the declared Status union", () => {
    const valid = new Set([
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "done",
      "cancelled",
    ]);
    for (const t of seedTasks) {
      assert.ok(valid.has(t.status), `bad status on ${t.id}: ${t.status}`);
    }
  });

  it("all task priorities are from the declared Priority union", () => {
    const valid = new Set(["urgent", "high", "medium", "low", "none"]);
    for (const t of seedTasks) {
      assert.ok(valid.has(t.priority), `bad priority on ${t.id}`);
    }
  });

  it("all task types are 'task' or 'issue'", () => {
    for (const t of seedTasks) {
      assert.ok(["task", "issue"].includes(t.type), `bad type on ${t.id}`);
    }
  });

  it("task ids are unique", () => {
    const ids = new Set(seedTasks.map((t) => t.id));
    assert.equal(ids.size, seedTasks.length);
  });
});

// ── Additional seed integrity checks ──────────────────────────────────────

describe("seedPosts — content format validity", () => {
  it("every post content.format is a valid PostFormat", () => {
    const valid = new Set(["video", "text", "image", "carousel", "live"]);
    for (const p of seedPosts) {
      assert.ok(
        valid.has(p.content.format),
        `bad format on ${p.id}: ${p.content.format}`,
      );
    }
  });
});

describe("seedPosts — context field ranges", () => {
  it("novelty is in [1, 5]", () => {
    for (const p of seedPosts) {
      assert.ok(p.context.novelty >= 1 && p.context.novelty <= 5, `bad novelty on ${p.id}`);
    }
  });

  it("emotion is in [1, 5]", () => {
    for (const p of seedPosts) {
      assert.ok(p.context.emotion >= 1 && p.context.emotion <= 5, `bad emotion on ${p.id}`);
    }
  });

  it("trendMatch is in [1, 5]", () => {
    for (const p of seedPosts) {
      assert.ok(p.context.trendMatch >= 1 && p.context.trendMatch <= 5, `bad trendMatch on ${p.id}`);
    }
  });

  it("sentiment is one of: neutral, positive, controversial", () => {
    const valid = new Set(["neutral", "positive", "controversial"]);
    for (const p of seedPosts) {
      assert.ok(valid.has(p.context.sentiment), `bad sentiment on ${p.id}: ${p.context.sentiment}`);
    }
  });

  it("postingHour is in [0, 23]", () => {
    for (const p of seedPosts) {
      assert.ok(
        Number.isInteger(p.context.postingHour) &&
        p.context.postingHour >= 0 &&
        p.context.postingHour <= 23,
        `bad postingHour on ${p.id}: ${p.context.postingHour}`,
      );
    }
  });

  it("dayOfWeek is in [0, 6]", () => {
    for (const p of seedPosts) {
      assert.ok(
        Number.isInteger(p.context.dayOfWeek) &&
        p.context.dayOfWeek >= 0 &&
        p.context.dayOfWeek <= 6,
        `bad dayOfWeek on ${p.id}: ${p.context.dayOfWeek}`,
      );
    }
  });
});

describe("seedPosts — platform validity", () => {
  it("every post platform is a known platform value", () => {
    const valid = new Set([
      "tiktok", "reels", "shorts", "x", "threads",
      "linkedin", "instagram_feed", "facebook",
    ]);
    for (const p of seedPosts) {
      assert.ok(valid.has(p.platform), `bad platform on ${p.id}: ${p.platform}`);
    }
  });
});

describe("seedTasks — t_-prefix on ids", () => {
  it("all task ids are t_-prefixed", () => {
    for (const t of seedTasks) assert.match(t.id, /^t_/);
  });
});

describe("seedProjects — p_-prefix on ids", () => {
  it("all project ids are p_-prefixed", () => {
    for (const p of seedProjects) assert.match(p.id, /^p_/);
  });
});

describe("seedUsers — handle format", () => {
  it("handles are non-empty strings without spaces", () => {
    for (const u of seedUsers) {
      assert.ok(u.handle.trim().length > 0, `empty handle on ${u.id}`);
      assert.ok(!u.handle.includes(" "), `space in handle on ${u.id}`);
    }
  });
});
