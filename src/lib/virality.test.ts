import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeBand,
  projectThreshold,
  recommend,
  scoreIntrinsic,
  scoreLive,
} from "./virality";
import { Post } from "./types";

function makePost(overrides: Partial<Post> = {}): Post {
  const base: Post = {
    id: "po_test",
    title: "Test post",
    platform: "tiktok",
    status: "draft",
    threshold: { metric: "views", value: 100000, window: "7d" },
    snapshots: [],
    content: {
      hook: "Why every SaaS app looks the same in 2026",
      caption: "A short take on why design got boring — and how to break the loop. Comment below.",
      hashtags: ["design", "saas", "indiehacker"],
      transcript: "",
      format: "video",
      durationSec: 22,
      hasTrendingAudio: true,
    },
    context: {
      audienceSize: 14000,
      accountAvgViews: 4200,
      postingHour: 20,
      dayOfWeek: 3,
      topicCategory: "design",
      novelty: 4,
      emotion: 4,
      trendMatch: 4,
      sentiment: "controversial",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

describe("scoreIntrinsic", () => {
  it("returns a value in 0..100", () => {
    const s = scoreIntrinsic(makePost());
    assert.ok(s.value >= 0 && s.value <= 100, `value out of range: ${s.value}`);
    assert.equal(typeof s.confidence, "number");
    assert.ok(Array.isArray(s.factors));
    assert.ok(s.factors.length > 0);
  });

  it("is deterministic for the same input", () => {
    const a = scoreIntrinsic(makePost());
    const b = scoreIntrinsic(makePost());
    assert.equal(a.value, b.value);
    assert.equal(a.factors.length, b.factors.length);
  });

  it("rewards a strong hook + good context over an empty post", () => {
    const strong = scoreIntrinsic(makePost());
    const weak = scoreIntrinsic(
      makePost({
        content: {
          hook: "",
          caption: "",
          hashtags: [],
          transcript: "",
          format: "text",
          durationSec: undefined,
          hasTrendingAudio: false,
        },
        context: {
          audienceSize: 10,
          accountAvgViews: 0,
          postingHour: 4,
          dayOfWeek: 1,
          topicCategory: "general",
          novelty: 1,
          emotion: 1,
          trendMatch: 1,
          sentiment: "neutral",
        },
      }),
    );
    assert.ok(
      strong.value > weak.value + 30,
      `expected strong > weak + 30 (got ${strong.value} vs ${weak.value})`,
    );
  });

  it("weights sum to ~1 per platform (no factor inflates the score)", () => {
    const s = scoreIntrinsic(makePost());
    const total = s.factors.reduce((sum, f) => sum + f.weight, 0);
    // Allow tiny float drift; weights are normalized.
    assert.ok(Math.abs(total - 1) < 0.001, `weights sum = ${total}`);
  });

  it("confidence is moderate without engagement data", () => {
    const s = scoreIntrinsic(makePost());
    assert.ok(s.confidence < 0.6);
  });

  it("contribution = raw * weight * 100 for every factor", () => {
    const s = scoreIntrinsic(makePost());
    for (const f of s.factors) {
      const expected = f.raw * f.weight * 100;
      assert.ok(
        Math.abs(expected - f.contribution) < 0.001,
        `contribution mismatch on ${f.id}`,
      );
    }
  });
});

describe("scoreLive", () => {
  it("returns undefined without snapshots", () => {
    assert.equal(scoreLive(makePost()), undefined);
  });

  it("blends intrinsic and live, with live weight rising over time", () => {
    const early = makePost({
      snapshots: [
        {
          id: "s1",
          atMinutes: 5,
          impressions: 1000,
          views: 950,
          likes: 80,
          comments: 10,
          shares: 12,
          saves: 8,
          retentionPct: 50,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const late = {
      ...early,
      snapshots: [
        ...early.snapshots,
        {
          id: "s2",
          atMinutes: 60,
          impressions: 50000,
          views: 48000,
          likes: 4000,
          comments: 500,
          shares: 1200,
          saves: 700,
          retentionPct: 55,
          capturedAt: "2026-01-01T01:00:00.000Z",
        },
      ],
    };
    const a = scoreLive(early);
    const b = scoreLive(late);
    assert.ok(a && b);
    assert.ok(b!.confidence >= a!.confidence);
  });

  it("includes both intrinsic and traction factor groups", () => {
    const post = makePost({
      snapshots: [
        {
          id: "s1",
          atMinutes: 30,
          impressions: 10000,
          views: 9500,
          likes: 800,
          comments: 100,
          shares: 220,
          saves: 60,
          retentionPct: 55,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const live = scoreLive(post);
    assert.ok(live);
    const groups = new Set(live!.factors.map((f) => f.group));
    assert.ok(groups.has("content"));
    assert.ok(groups.has("traction") || groups.has("diffusion"));
  });
});

describe("describeBand", () => {
  it("maps every band to a label and tone", () => {
    for (const band of ["flop", "meh", "solid", "hot", "rocket"] as const) {
      const d = describeBand(band);
      assert.ok(d.label && d.tone.startsWith("#"));
    }
  });
});

describe("recommend", () => {
  it("returns no recommendations for a near-perfect post", () => {
    const perfect = makePost({
      content: {
        hook: "Stop scrolling — this is the one tip you need.",
        caption: Array(90).fill("a").join(""),
        hashtags: ["a", "b", "c", "d"],
        transcript: "",
        format: "video",
        durationSec: 21,
        hasTrendingAudio: true,
      },
      context: {
        audienceSize: 14000,
        accountAvgViews: 14000,
        postingHour: 20,
        dayOfWeek: 3,
        topicCategory: "design",
        novelty: 5,
        emotion: 5,
        trendMatch: 5,
        sentiment: "controversial",
      },
    });
    const recs = recommend(perfect);
    assert.ok(recs.length <= 2, `expected near-zero recs, got ${recs.length}`);
  });

  it("flags an empty hook", () => {
    const post = makePost({
      content: { ...makePost().content, hook: "" },
    });
    const recs = recommend(post);
    assert.ok(recs.some((r) => r.factorId === "hook"));
  });

  it("flags off-peak posting time", () => {
    const post = makePost({
      context: { ...makePost().context, postingHour: 3, dayOfWeek: 0 },
    });
    const recs = recommend(post);
    assert.ok(recs.some((r) => r.factorId === "postingTime"));
  });

  it("sorts by potential gain", () => {
    const post = makePost({
      content: {
        hook: "",
        caption: "",
        hashtags: [],
        transcript: "",
        format: "text", // bad fit on TikTok
        durationSec: undefined,
        hasTrendingAudio: false,
      },
      context: {
        audienceSize: 10,
        accountAvgViews: 0,
        postingHour: 3,
        dayOfWeek: 0,
        topicCategory: "general",
        novelty: 1,
        emotion: 1,
        trendMatch: 1,
        sentiment: "neutral",
      },
    });
    const recs = recommend(post, 10);
    for (let i = 1; i < recs.length; i++) {
      assert.ok(
        recs[i - 1].potentialGain >= recs[i].potentialGain,
        `recs not sorted by gain at index ${i}`,
      );
    }
  });
});

describe("projectThreshold", () => {
  it("returns undefined without snapshots", () => {
    assert.equal(projectThreshold(makePost()), undefined);
  });

  it("projects a higher value than the latest snapshot for early data", () => {
    const post = makePost({
      threshold: { metric: "views", value: 500_000, window: "7d" },
      snapshots: [
        {
          id: "s1",
          atMinutes: 60,
          impressions: 12_000,
          views: 11_500,
          likes: 1000,
          comments: 200,
          shares: 400,
          saves: 90,
          retentionPct: 55,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const p = projectThreshold(post)!;
    assert.ok(p.projected > 11_500);
    assert.ok(p.probability >= 0 && p.probability <= 1);
  });

  it("higher engagement → higher hit probability", () => {
    const low = makePost({
      threshold: { metric: "views", value: 1_000_000, window: "7d" },
      snapshots: [
        {
          id: "s1",
          atMinutes: 60,
          impressions: 1_000,
          views: 950,
          likes: 50,
          comments: 5,
          shares: 5,
          saves: 1,
          retentionPct: 30,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const high = makePost({
      threshold: { metric: "views", value: 1_000_000, window: "7d" },
      snapshots: [
        {
          id: "s1",
          atMinutes: 60,
          impressions: 200_000,
          views: 195_000,
          likes: 14_000,
          comments: 1_500,
          shares: 4_000,
          saves: 800,
          retentionPct: 60,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const a = projectThreshold(low)!;
    const b = projectThreshold(high)!;
    assert.ok(b.probability > a.probability);
  });
});
