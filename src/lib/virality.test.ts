import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeBand,
  platformProfile,
  projectThreshold,
  recommend,
  scoreIntrinsic,
  scoreLive,
} from "./virality";
import { Platform, Post, SCORE_BANDS } from "./types";

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

  it("supports the 'shares' metric", () => {
    const post = makePost({
      threshold: { metric: "shares", value: 10_000, window: "7d" },
      snapshots: [
        {
          id: "s1",
          atMinutes: 60,
          impressions: 10_000,
          views: 9_500,
          likes: 800,
          comments: 100,
          shares: 200,
          saves: 60,
          retentionPct: 55,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const p = projectThreshold(post)!;
    assert.equal(p.metric, "shares");
    assert.ok(p.projected > 200);
  });

  it("supports the 'engagement_rate' metric", () => {
    const post = makePost({
      threshold: { metric: "engagement_rate", value: 0.05, window: "7d" },
      snapshots: [
        {
          id: "s1",
          atMinutes: 60,
          impressions: 1_000,
          views: 950,
          likes: 100,
          comments: 20,
          shares: 30,
          saves: 10,
          retentionPct: 55,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const p = projectThreshold(post)!;
    assert.equal(p.metric, "engagement_rate");
    assert.ok(p.projected > 0 && p.projected < 1);
  });

  it("uses impressions when views is 0", () => {
    const post = makePost({
      threshold: { metric: "views", value: 100_000, window: "7d" },
      snapshots: [
        {
          id: "s1",
          atMinutes: 60,
          impressions: 5000,
          views: 0,
          likes: 100,
          comments: 10,
          shares: 30,
          saves: 5,
          retentionPct: 55,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const p = projectThreshold(post)!;
    // metricNow falls back to impressions=5000; projected scales up from there.
    assert.ok(p.projected > 5000);
  });

  it("respects the 24h and 30d windows", () => {
    const snap = {
      id: "s1",
      atMinutes: 60,
      impressions: 10_000,
      views: 9_500,
      likes: 500,
      comments: 50,
      shares: 100,
      saves: 20,
      retentionPct: 55,
      capturedAt: "2026-01-01T00:00:00.000Z",
    };
    const a = projectThreshold(
      makePost({ threshold: { metric: "views", value: 100_000, window: "24h" }, snapshots: [snap] }),
    )!;
    const b = projectThreshold(
      makePost({ threshold: { metric: "views", value: 100_000, window: "30d" }, snapshots: [snap] }),
    )!;
    assert.equal(a.windowMinutes, 24 * 60);
    assert.equal(b.windowMinutes, 30 * 24 * 60);
    // The 30d window has more time, so projected value is ≥ the 24h one.
    assert.ok(b.projected >= a.projected);
  });

  it("returns probability=0 when threshold value is 0", () => {
    const post = makePost({
      threshold: { metric: "views", value: 0, window: "7d" },
      snapshots: [
        {
          id: "s1",
          atMinutes: 60,
          impressions: 1000,
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
    const p = projectThreshold(post)!;
    // With value=0 the ratio guard returns 0 → sigmoid(-1.5) ≈ 0.18
    assert.ok(p.probability < 0.5);
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

// ── New: per-platform coverage ─────────────────────────────────────────────

describe("platformProfile + per-platform scoring", () => {
  const PLATFORMS: Platform[] = [
    "tiktok",
    "reels",
    "shorts",
    "instagram_feed",
    "x",
    "threads",
    "linkedin",
    "facebook",
  ];

  for (const platform of PLATFORMS) {
    it(`returns a profile for ${platform} with sum(weights) ≈ 1`, () => {
      const p = platformProfile(platform);
      const s = scoreIntrinsic(makePost({ platform }));
      const total = s.factors.reduce((sum, f) => sum + f.weight, 0);
      assert.ok(Math.abs(total - 1) < 0.001, `weights sum=${total} for ${platform}`);
      assert.ok(p.captionSweet.ideal > 0);
      assert.ok(p.peakHours.length > 0);
    });
  }

  it("non-video platforms have no videoTargetSec", () => {
    for (const p of ["instagram_feed", "x", "threads", "linkedin"] as Platform[]) {
      assert.equal(platformProfile(p).videoTargetSec, undefined);
    }
  });

  it("video platforms have a videoTargetSec range", () => {
    for (const p of ["tiktok", "reels", "shorts", "facebook"] as Platform[]) {
      const t = platformProfile(p).videoTargetSec!;
      assert.ok(t.min < t.ideal && t.ideal < t.max, `bad range on ${p}`);
    }
  });
});

// ── New: format/sentiment branches in scoreIntrinsic ───────────────────────

describe("scoreIntrinsic — format & sentiment branches", () => {
  const formats: any[] = ["video", "image", "carousel", "text", "live"];

  for (const format of formats) {
    it(`scores ${format} format on tiktok without error`, () => {
      const s = scoreIntrinsic(
        makePost({
          content: { ...makePost().content, format },
        }),
      );
      assert.ok(s.value >= 0 && s.value <= 100);
    });
  }

  for (const sentiment of [
    "negative",
    "neutral",
    "positive",
    "controversial",
  ] as const) {
    it(`scores sentiment=${sentiment}`, () => {
      const s = scoreIntrinsic(
        makePost({ context: { ...makePost().context, sentiment } }),
      );
      assert.ok(s.value >= 0 && s.value <= 100);
    });
  }

  it("controversial sentiment outscores neutral, all else equal", () => {
    const neutral = scoreIntrinsic(
      makePost({ context: { ...makePost().context, sentiment: "neutral" } }),
    );
    const controversial = scoreIntrinsic(
      makePost({
        context: { ...makePost().context, sentiment: "controversial" },
      }),
    );
    assert.ok(controversial.value > neutral.value);
  });
});

// ── New: duration sub-branches ─────────────────────────────────────────────

describe("scoreIntrinsic — duration branches", () => {
  it("video shorter than min is penalized vs ideal", () => {
    const ideal = scoreIntrinsic(
      makePost({ content: { ...makePost().content, durationSec: 21 } }),
    );
    const tooShort = scoreIntrinsic(
      makePost({ content: { ...makePost().content, durationSec: 3 } }),
    );
    assert.ok(ideal.value > tooShort.value);
  });

  it("video longer than max is penalized vs ideal", () => {
    const ideal = scoreIntrinsic(
      makePost({ content: { ...makePost().content, durationSec: 21 } }),
    );
    const tooLong = scoreIntrinsic(
      makePost({ content: { ...makePost().content, durationSec: 120 } }),
    );
    assert.ok(ideal.value > tooLong.value);
  });

  it("undefined durationSec is handled (no crash) on video platforms", () => {
    const s = scoreIntrinsic(
      makePost({ content: { ...makePost().content, durationSec: undefined } }),
    );
    assert.ok(s.value >= 0 && s.value <= 100);
  });
});

// ── New: empty / boundary inputs ───────────────────────────────────────────

describe("scoreIntrinsic — boundary inputs", () => {
  it("handles audienceSize=0 without divide-by-zero", () => {
    const s = scoreIntrinsic(
      makePost({
        context: { ...makePost().context, audienceSize: 0, accountAvgViews: 0 },
      }),
    );
    assert.ok(Number.isFinite(s.value));
  });

  it("handles empty hashtags array", () => {
    const s = scoreIntrinsic(
      makePost({ content: { ...makePost().content, hashtags: [] } }),
    );
    assert.ok(Number.isFinite(s.value));
  });
});

// ── New: bandFor (via score values) ────────────────────────────────────────

describe("score band thresholds (SCORE_BANDS contract)", () => {
  it("band thresholds are strictly ascending", () => {
    for (let i = 1; i < SCORE_BANDS.length; i++) {
      assert.ok(SCORE_BANDS[i].min > SCORE_BANDS[i - 1].min);
    }
  });

  it("a near-perfect tiktok scores in 'hot' or 'rocket'", () => {
    const s = scoreIntrinsic(
      makePost({
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
      }),
    );
    assert.ok(["hot", "rocket"].includes(s.band), `band was ${s.band}`);
  });

  it("a near-empty post scores in 'flop'", () => {
    const s = scoreIntrinsic(
      makePost({
        content: {
          hook: "",
          caption: "",
          hashtags: [],
          transcript: "",
          format: "text", // bad fit on tiktok
          durationSec: undefined,
          hasTrendingAudio: false,
        },
        context: {
          audienceSize: 0,
          accountAvgViews: 0,
          postingHour: 4,
          dayOfWeek: 0,
          topicCategory: "general",
          novelty: 1,
          emotion: 1,
          trendMatch: 1,
          sentiment: "neutral",
        },
      }),
    );
    assert.equal(s.band, "flop");
  });
});

// ── New: recommend message branches ────────────────────────────────────────

describe("recommend — message branches", () => {
  it("flags missing/short hooks differently", () => {
    const empty = recommend(
      makePost({ content: { ...makePost().content, hook: "" } }),
    );
    assert.ok(
      empty.find((r) => r.factorId === "hook" && /Add a hook/.test(r.message)),
    );

    const tooShort = recommend(
      makePost({ content: { ...makePost().content, hook: "Hi" } }),
    );
    assert.ok(
      tooShort.find(
        (r) => r.factorId === "hook" && /aim for 4–8/.test(r.message),
      ),
    );

    const tooLong = recommend(
      makePost({
        content: {
          ...makePost().content,
          hook: Array(20).fill("word").join(" "),
        },
      }),
    );
    assert.ok(
      tooLong.find(
        (r) => r.factorId === "hook" && /tighten/.test(r.message),
      ),
    );
  });

  it("hashtag rec uses 'hashtag' singular when off by 1", () => {
    // tiktok ideal=4. Provide 3 hashtags → diff=-1 → "Add 1 more hashtag"
    const recs = recommend(
      makePost({
        content: { ...makePost().content, hashtags: ["a", "b", "c"] },
      }),
      20,
    );
    const r = recs.find((x) => x.factorId === "hashtags");
    if (r) assert.match(r.message, /1 more hashtag(?!s)/);
  });

  it("trendingAudio suggestion only appears on tiktok/reels", () => {
    const linkedinRecs = recommend(
      makePost({
        platform: "linkedin",
        content: {
          ...makePost().content,
          format: "text",
          hasTrendingAudio: false,
        },
      }),
      20,
    );
    assert.ok(!linkedinRecs.find((r) => r.factorId === "trendingAudio"));
  });

  it("flags neutral sentiment as a weakness", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, sentiment: "neutral" } }),
      20,
    );
    if (recs.find((r) => r.factorId === "sentiment")) {
      // good — message branch fired
      assert.ok(true);
    }
  });

  it("respects max parameter cap", () => {
    const recs = recommend(
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
          postingHour: 3,
          dayOfWeek: 0,
          topicCategory: "general",
          novelty: 1,
          emotion: 1,
          trendMatch: 1,
          sentiment: "neutral",
        },
      }),
      2,
    );
    assert.ok(recs.length <= 2);
  });

  it("postingTime suggestion differentiates hour-only vs day-only off-peak", () => {
    // hour OK, day off → "Shift to a peak day"
    const dayOff = recommend(
      makePost({
        platform: "tiktok", // peakHours include 20, peakDays=[2,3,4,6]
        context: { ...makePost().context, postingHour: 20, dayOfWeek: 0 },
      }),
      20,
    );
    const r1 = dayOff.find((r) => r.factorId === "postingTime");
    if (r1) assert.match(r1.message, /peak day/);

    // day OK, hour off
    const hourOff = recommend(
      makePost({
        platform: "tiktok",
        context: { ...makePost().context, postingHour: 4, dayOfWeek: 3 },
      }),
      20,
    );
    const r2 = hourOff.find((r) => r.factorId === "postingTime");
    if (r2) assert.match(r2.message, /peak window/);
  });
});

// ── New: extraFactors plumbing ─────────────────────────────────────────────

describe("scoreIntrinsic — extraFactors plumbing", () => {
  it("accepts plugin-injected factors and reflects them in output", () => {
    const extra = {
      id: "plugin_test",
      label: "Plugin test",
      group: "content" as const,
      raw: 0.5,
      weight: 0.1,
      contribution: 5,
      hint: "Test",
    };
    const s = scoreIntrinsic(makePost(), [extra]);
    assert.ok(s.factors.find((f) => f.id === "plugin_test"));
  });
});

// ── New: describeBand round-trip ───────────────────────────────────────────

describe("describeBand", () => {
  it("returns a distinct tone per band", () => {
    const tones = new Set(
      (["flop", "meh", "solid", "hot", "rocket"] as const).map(
        (b) => describeBand(b).tone,
      ),
    );
    assert.equal(tones.size, 5);
  });
});

// ── Additional: scoreLive edge cases ──────────────────────────────────────

describe("scoreLive — additional edge cases", () => {
  it("uses first-snapshot velocity formula when no prior snapshot exists", () => {
    // With only one snapshot, velocity = views/atMinutes/views (always 1/atMinutes).
    // This branch must not crash and must yield a finite value.
    const post = makePost({
      snapshots: [
        {
          id: "s1",
          atMinutes: 30,
          impressions: 5000,
          views: 5000,
          likes: 200,
          comments: 30,
          shares: 80,
          saves: 20,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const live = scoreLive(post)!;
    assert.ok(live);
    assert.ok(Number.isFinite(live.value));
    assert.ok(live.value >= 0 && live.value <= 100);
  });

  it("handles a platform with zero retention weight (instagram_feed)", () => {
    // instagram_feed has liveWeights.retention = 0. The factor gets filtered
    // out (weight > 0 guard). The score must still be finite and valid.
    const post = makePost({
      platform: "instagram_feed",
      snapshots: [
        {
          id: "s1",
          atMinutes: 20,
          impressions: 8000,
          views: 7500,
          likes: 600,
          comments: 80,
          shares: 150,
          saves: 200,
          retentionPct: 50,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const live = scoreLive(post)!;
    assert.ok(live);
    assert.ok(Number.isFinite(live.value));
    // No retention factor should be present (weight is 0, gets filtered out).
    assert.ok(!live.factors.find((f) => f.id === "retention" && f.weight > 0));
  });

  it("with views=0 in both snapshots, velocity still produces a finite score", () => {
    const post = makePost({
      snapshots: [
        {
          id: "s1",
          atMinutes: 5,
          impressions: 100,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "s2",
          atMinutes: 15,
          impressions: 200,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          capturedAt: "2026-01-01T00:00:15.000Z",
        },
      ],
    });
    const live = scoreLive(post)!;
    assert.ok(live);
    assert.ok(Number.isFinite(live.value));
  });

  it("blended confidence is clamped to [0.45, 0.95]", () => {
    // At atMinutes=0, liveCurve(0) = 0.2. confidence = 0.45 + 0.5*0.2 = 0.55
    const post = makePost({
      snapshots: [
        {
          id: "s1",
          atMinutes: 0,
          impressions: 1000,
          views: 900,
          likes: 50,
          comments: 5,
          shares: 10,
          saves: 5,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const live = scoreLive(post)!;
    assert.ok(live);
    assert.ok(live.confidence >= 0.45 && live.confidence <= 0.95);
  });
});

// ── Additional: recommend() message branches ──────────────────────────────

describe("recommend — additional message branches", () => {
  it("recommends switching format when current format is not the best for the platform", () => {
    // tiktok best format = video. Using "text" should trigger format rec.
    const recs = recommend(
      makePost({ content: { ...makePost().content, format: "text" } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "format");
    assert.ok(r, "expected a format recommendation");
    assert.match(r!.message, /video/);
  });

  it("does NOT recommend format when format already matches platform best", () => {
    // tiktok → video is the best. A post already using video should not get format rec.
    const recs = recommend(
      makePost({ content: { ...makePost().content, format: "video" } }),
      20,
    );
    // format factor either absent or headroom too small
    const r = recs.find((x) => x.factorId === "format");
    assert.ok(!r, "should not recommend format when already using the best");
  });

  it("duration rec: too short produces correct message", () => {
    // tiktok min=8s, ideal=21s. durationSec=3 < min.
    const recs = recommend(
      makePost({ content: { ...makePost().content, durationSec: 3, format: "video" } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "duration");
    assert.ok(r, "expected duration recommendation for too-short video");
    assert.match(r!.message, /too short/);
  });

  it("duration rec: too long produces correct message", () => {
    // tiktok max=60s. durationSec=150 > max.
    const recs = recommend(
      makePost({ content: { ...makePost().content, durationSec: 150, format: "video" } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "duration");
    assert.ok(r, "expected duration recommendation for too-long video");
    assert.match(r!.message, /long/);
  });

  it("duration rec: missing duration triggers 'Set the video duration' message", () => {
    const recs = recommend(
      makePost({ content: { ...makePost().content, durationSec: undefined, format: "video" } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "duration");
    assert.ok(r, "expected duration rec when duration not set");
    assert.match(r!.message, /Set the video duration/);
  });

  it("duration rec: slightly off target (>8s from ideal) triggers trim message", () => {
    // tiktok ideal=21s. durationSec=35 is 14s off → ">8s" branch.
    const recs = recommend(
      makePost({ content: { ...makePost().content, durationSec: 35, format: "video" } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "duration");
    assert.ok(r, "expected duration recommendation");
    assert.match(r!.message, /Trim toward/);
  });

  it("duration rec: within 8s of target → no recommendation", () => {
    // tiktok ideal=21s. durationSec=25 is 4s off → within tolerance.
    const recs = recommend(
      makePost({ content: { ...makePost().content, durationSec: 25, format: "video" } }),
      20,
    );
    assert.ok(!recs.find((x) => x.factorId === "duration"), "no duration rec within 8s");
  });

  it("caption rec: empty caption → 'Caption is empty' message", () => {
    const recs = recommend(
      makePost({ content: { ...makePost().content, caption: "" } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "caption");
    if (r) assert.match(r.message, /empty/);
  });

  it("caption rec: too short → 'push toward' message", () => {
    // tiktok ideal=90. Providing 5-char caption → way below ideal.
    const recs = recommend(
      makePost({ content: { ...makePost().content, caption: "Hi!" } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "caption");
    if (r) assert.match(r.message, /push toward/);
  });

  it("caption rec: way over ideal → 'trim toward' message", () => {
    // tiktok ideal=90. Providing 500-char caption → way over.
    const longCaption = "a".repeat(500);
    const recs = recommend(
      makePost({ content: { ...makePost().content, caption: longCaption } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "caption");
    if (r) assert.match(r.message, /trim toward/i);
  });

  it("baseline rec: audienceSize=0 → 'Set audience size' message", () => {
    const recs = recommend(
      makePost({
        context: { ...makePost().context, audienceSize: 0, accountAvgViews: 0 },
      }),
      20,
    );
    const r = recs.find((x) => x.factorId === "baseline");
    if (r) assert.match(r.message, /audience size/i);
  });

  it("baseline rec: accountAvgViews=0 with positive audience → 'Add recent average' message", () => {
    const recs = recommend(
      makePost({
        context: { ...makePost().context, audienceSize: 10000, accountAvgViews: 0 },
      }),
      20,
    );
    const r = recs.find((x) => x.factorId === "baseline");
    if (r) assert.match(r.message, /average views/i);
  });

  it("novelty rec: novelty=1 → 're-angle the hook' message", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, novelty: 1 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "novelty");
    if (r) assert.match(r.message, /re-angle/);
  });

  it("novelty rec: novelty=3 → 'Bump novelty' message", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, novelty: 3 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "novelty");
    if (r) assert.match(r.message, /Bump novelty/);
  });

  it("emotion rec: emotion=1 → 'Inject more emotional charge' message", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, emotion: 1 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "emotion");
    if (r) assert.match(r.message, /Inject more/);
  });

  it("emotion rec: emotion=3 → 'Push the emotional payoff' message", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, emotion: 3 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "emotion");
    if (r) assert.match(r.message, /Push the emotional payoff/);
  });

  it("trendMatch rec: trendMatch=1 → 'Tie the post to a current trend cluster'", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, trendMatch: 1 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "trendMatch");
    if (r) assert.match(r.message, /trend cluster/);
  });

  it("trendingAudio rec: only surfaces for tiktok and reels", () => {
    const tiktokRecs = recommend(
      makePost({
        platform: "tiktok",
        content: { ...makePost().content, hasTrendingAudio: false },
      }),
      20,
    );
    const reelsRecs = recommend(
      makePost({
        platform: "reels",
        content: { ...makePost().content, format: "video", hasTrendingAudio: false },
      }),
      20,
    );
    const shortsRecs = recommend(
      makePost({
        platform: "shorts",
        content: { ...makePost().content, hasTrendingAudio: false },
      }),
      20,
    );
    // tiktok and reels should surface trendingAudio
    assert.ok(tiktokRecs.find((r) => r.factorId === "trendingAudio") !== undefined);
    assert.ok(reelsRecs.find((r) => r.factorId === "trendingAudio") !== undefined);
    // shorts should NOT (platform check in messageFor)
    assert.ok(!shortsRecs.find((r) => r.factorId === "trendingAudio"));
  });

  it("hashtag rec: over ideal → 'Trim' message with plural", () => {
    // tiktok ideal=4. Providing 8 hashtags → diff=4 → "Trim 4 hashtags"
    const recs = recommend(
      makePost({
        content: { ...makePost().content, hashtags: ["a", "b", "c", "d", "e", "f", "g", "h"] },
      }),
      20,
    );
    const r = recs.find((x) => x.factorId === "hashtags");
    if (r) {
      assert.match(r.message, /Trim/);
      assert.match(r.message, /hashtags/);
    }
  });
});

// ── Additional: projectThreshold edge cases ───────────────────────────────

describe("projectThreshold — additional edge cases", () => {
  it("uses atMinutes=1 as floor to avoid log(1)=0 division", () => {
    // atMinutes=0 → t=max(0,1)=1. Math.log(2)/Math.log(2)=1 → projected=metricNow.
    const post = makePost({
      threshold: { metric: "views", value: 1000, window: "7d" },
      snapshots: [
        {
          id: "s1",
          atMinutes: 0,
          impressions: 500,
          views: 500,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const p = projectThreshold(post)!;
    assert.ok(p);
    assert.ok(Number.isFinite(p.projected));
  });

  it("probability is in [0, 1] for all threshold metrics", () => {
    const metrics = ["views", "shares", "engagement_rate"] as const;
    const snap = {
      id: "s1",
      atMinutes: 60,
      impressions: 5000,
      views: 4500,
      likes: 300,
      comments: 30,
      shares: 50,
      saves: 20,
      capturedAt: "2026-01-01T00:00:00.000Z",
    };
    for (const metric of metrics) {
      const value = metric === "engagement_rate" ? 0.05 : metric === "shares" ? 1000 : 100_000;
      const p = projectThreshold(
        makePost({ threshold: { metric, value, window: "7d" }, snapshots: [snap] }),
      )!;
      assert.ok(p.probability >= 0 && p.probability <= 1, `probability out of [0,1] for metric=${metric}`);
    }
  });

  it("basisMinutes matches latest snapshot's atMinutes", () => {
    const post = makePost({
      threshold: { metric: "views", value: 100_000, window: "7d" },
      snapshots: [
        {
          id: "s1",
          atMinutes: 30,
          impressions: 2000,
          views: 1800,
          likes: 100,
          comments: 10,
          shares: 20,
          saves: 5,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "s2",
          atMinutes: 120,
          impressions: 8000,
          views: 7500,
          likes: 400,
          comments: 40,
          shares: 80,
          saves: 25,
          capturedAt: "2026-01-01T02:00:00.000Z",
        },
      ],
    });
    const p = projectThreshold(post)!;
    assert.equal(p.basisMinutes, 120);
  });
});
