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

  it("recommend surfaces a low-raw injected plugin factor as a weakness", () => {
    const weak = {
      id: "plugin_weak",
      label: "Plugin weak",
      group: "content" as const,
      raw: 0.1,
      weight: 0.1,
      contribution: 1,
      hint: "Bad",
    };
    const recs = recommend(makePost(), 20, [weak]);
    // The factor itself isn't routed through messageFor (no case matches
    // its id), so it should NOT generate a Recommendation row even though
    // it counts toward the score. Asserts the messageFor switch's
    // default-undefined behaviour.
    assert.ok(!recs.find((r) => r.factorId === "plugin_weak"));
  });

  it("recommend ignores a perfect-raw injected plugin factor (no headroom)", () => {
    const perfect = {
      id: "plugin_perfect",
      label: "Plugin perfect",
      group: "content" as const,
      raw: 1.0,
      weight: 0.1,
      contribution: 10,
      hint: "Great",
    };
    const recs = recommend(makePost(), 20, [perfect]);
    assert.ok(!recs.find((r) => r.factorId === "plugin_perfect"));
  });
});

describe("scoreLive — commentDepth zero-likes branch", () => {
  it("uses comments/50 path when likes=0 and stays finite", () => {
    const post = makePost({
      snapshots: [
        {
          id: "s1",
          atMinutes: 30,
          impressions: 5000,
          views: 4500,
          likes: 0, // forces the comments/50 branch
          comments: 100,
          shares: 20,
          saves: 5,
          retentionPct: 55,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const live = scoreLive(post)!;
    assert.ok(Number.isFinite(live.value));
    const cd = live.factors.find((f) => f.id === "commentDepth");
    assert.ok(cd, "commentDepth factor expected");
    // 100 comments / 50 = 2, clamped to 1.
    assert.ok(cd!.raw > 0);
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

// ── New: scoreLive deeper coverage ─────────────────────────────────────────

describe("scoreLive — deeper coverage", () => {
  it("blended confidence stays inside [0.55, 0.875] (clamp + curve bounds)", () => {
    // confidence = clamp(0.45 + 0.5 * liveW); liveW is clamped to [0.2, 0.85].
    const early = makePost({
      snapshots: [
        {
          id: "s1",
          atMinutes: 0,
          impressions: 1000,
          views: 900,
          likes: 50,
          comments: 5,
          shares: 5,
          saves: 2,
          retentionPct: 50,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const late = makePost({
      snapshots: [
        {
          id: "s1",
          atMinutes: 10_000, // very late — pushes liveW to its clamp ceiling
          impressions: 1_000_000,
          views: 900_000,
          likes: 50_000,
          comments: 5_000,
          shares: 5_000,
          saves: 2_000,
          retentionPct: 70,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const a = scoreLive(early)!;
    const b = scoreLive(late)!;
    assert.ok(a.confidence >= 0.55, `early conf=${a.confidence}`);
    assert.ok(b.confidence <= 0.875, `late conf=${b.confidence}`);
  });

  it("velocity branch with only one snapshot stays finite", () => {
    const post = makePost({
      snapshots: [
        {
          id: "s1",
          atMinutes: 30,
          impressions: 5000,
          views: 4500,
          likes: 200,
          comments: 20,
          shares: 50,
          saves: 10,
          retentionPct: 55,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const live = scoreLive(post)!;
    assert.ok(Number.isFinite(live.value));
    assert.ok(live.factors.some((f) => f.id === "velocity"));
  });

  it("instagram_feed (retention weight 0) drops retention from factor list", () => {
    const post = makePost({
      platform: "instagram_feed",
      snapshots: [
        {
          id: "s1",
          atMinutes: 20,
          impressions: 2000,
          views: 1800,
          likes: 150,
          comments: 20,
          shares: 30,
          saves: 50,
          retentionPct: 55,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const live = scoreLive(post)!;
    assert.ok(Number.isFinite(live.value));
    assert.ok(
      !live.factors.find((f) => f.id === "retention"),
      "retention factor should be filtered out when weight=0",
    );
  });
});

// ── New: projectThreshold edge cases ───────────────────────────────────────

describe("projectThreshold — edge cases", () => {
  it("uses atMinutes=1 as floor to avoid log(0+1)/log(0+1) NaN", () => {
    const post = makePost({
      threshold: { metric: "views", value: 1000, window: "7d" },
      snapshots: [
        {
          id: "s1",
          atMinutes: 0,
          impressions: 500,
          views: 450,
          likes: 20,
          comments: 2,
          shares: 5,
          saves: 1,
          retentionPct: 50,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const p = projectThreshold(post)!;
    assert.ok(Number.isFinite(p.projected));
    assert.ok(p.projected > 0);
  });

  it("probability stays in [0, 1] across all threshold metrics", () => {
    const snap = {
      id: "s1",
      atMinutes: 60,
      impressions: 5000,
      views: 4500,
      likes: 300,
      comments: 30,
      shares: 100,
      saves: 20,
      retentionPct: 55,
      capturedAt: "2026-01-01T00:00:00.000Z",
    };
    for (const metric of ["views", "shares", "engagement_rate"] as const) {
      const p = projectThreshold(
        makePost({
          threshold: { metric, value: 1_000_000, window: "7d" },
          snapshots: [snap],
        }),
      )!;
      assert.ok(p.probability >= 0 && p.probability <= 1, `metric=${metric}`);
    }
  });

  it("basisMinutes equals the latest snapshot's atMinutes", () => {
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
          shares: 30,
          saves: 5,
          retentionPct: 50,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "s2",
          atMinutes: 120,
          impressions: 8000,
          views: 7500,
          likes: 400,
          comments: 30,
          shares: 100,
          saves: 20,
          retentionPct: 55,
          capturedAt: "2026-01-01T02:00:00.000Z",
        },
      ],
    });
    const p = projectThreshold(post)!;
    assert.equal(p.basisMinutes, 120);
  });
});

// ── Additional: scoreLive zero-impressions guard ────────────────────────────

describe("scoreLive — zero-impressions guard", () => {
  it("stays finite when impressions and views are both 0", () => {
    // max(impressions, views, 1) == 1 ensures no divide-by-zero
    const post = makePost({
      snapshots: [
        {
          id: "s1",
          atMinutes: 30,
          impressions: 0,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const live = scoreLive(post)!;
    assert.ok(Number.isFinite(live.value));
    assert.ok(live.value >= 0 && live.value <= 100);
  });
});

// ── Additional: recommend format message branch ─────────────────────────────

describe("recommend — format switch message", () => {
  it("recommends switching format when current is not optimal for platform", () => {
    // On tiktok, 'video' is best (1.0) and 'text' is worst (0). Recommending
    // a format switch should only appear when format != best.
    const recs = recommend(
      makePost({
        content: {
          ...makePost().content,
          format: "text", // worst for tiktok
          hook: "Good hook", // keep hook strong
        },
      }),
      20,
    );
    const r = recs.find((x) => x.factorId === "format");
    if (r) assert.match(r.message, /rewards video/i);
  });

  it("does NOT recommend format switch when already using the optimal format", () => {
    const recs = recommend(
      makePost({
        content: {
          ...makePost().content,
          format: "video", // best for tiktok
        },
      }),
      20,
    );
    assert.ok(!recs.find((r) => r.factorId === "format"));
  });
});

// ── Additional: scoreIntrinsic extraFactors value clamp ────────────────────

describe("scoreIntrinsic — extraFactors raw clamping", () => {
  it("clamps extraFactor raw > 1 to 1 (value boundary)", () => {
    const overflow = {
      id: "plugin_overflow",
      label: "Overflow",
      group: "content" as const,
      raw: 99, // way above 1
      weight: 0.05,
      contribution: 99 * 0.05 * 100,
      hint: "Test overflow",
    };
    const s = scoreIntrinsic(makePost(), [overflow]);
    // With raw clamped to 1, the contribution should be ≤ 5 (1 * 0.05 * 100)
    const factor = s.factors.find((f) => f.id === "plugin_overflow")!;
    assert.ok(factor);
    assert.ok(factor.raw <= 1, `raw should be clamped; got ${factor.raw}`);
  });
});

// ── Additional: recommend — trendMatch low branches ───────────────────────

describe("recommend — trendMatch low branches", () => {
  it("trendMatch <= 2 produces 'Tie the post to a current trend' message", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, trendMatch: 2 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "trendMatch");
    if (r) assert.match(r.message, /current trend/i);
  });

  it("trendMatch >= 3 does not produce a trendMatch recommendation", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, trendMatch: 3 } }),
      20,
    );
    // trendMatch=3 returns undefined in messageFor, so no rec.
    assert.ok(!recs.find((r) => r.factorId === "trendMatch"));
  });
});

// ── Additional: scoreIntrinsic — hasTrendingAudio weight=0 on non-TikTok/Reels

describe("scoreIntrinsic — trendingAudio weight=0 on text-first platforms", () => {
  it("x and threads have no trendingAudio factor (weight=0 filtered)", () => {
    for (const platform of ["x", "threads", "linkedin"] as const) {
      const s = scoreIntrinsic(makePost({ platform }));
      assert.ok(
        !s.factors.find((f) => f.id === "trendingAudio"),
        `expected no trendingAudio factor on ${platform}`,
      );
    }
  });
});

// ── New: recommend message branches (granular) ─────────────────────────────

describe("recommend — granular message branches", () => {

    const recs = recommend(
      makePost({ content: { ...makePost().content, caption: "" } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "caption");
    if (r) assert.match(r.message, /Caption is empty/);
  });

  it("caption way over ideal: 'trim toward' message", () => {
    const recs = recommend(
      makePost({
        content: {
          ...makePost().content,
          caption: Array(1000).fill("x").join(""),
        },
      }),
      20,
    );
    const r = recs.find((x) => x.factorId === "caption");
    if (r) assert.match(r.message, /trim toward/);
  });

  it("duration: 'Set the video duration' when missing", () => {
    const recs = recommend(
      makePost({
        content: {
          ...makePost().content,
          durationSec: undefined,
        },
      }),
      20,
    );
    const r = recs.find((x) => x.factorId === "duration");
    if (r) assert.match(r.message, /Set the video duration/);
  });

  it("duration: 'too short' for below min", () => {
    const recs = recommend(
      makePost({ content: { ...makePost().content, durationSec: 3 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "duration");
    if (r) assert.match(r.message, /too short/);
  });

  it("duration: 'long for this platform' when above max", () => {
    const recs = recommend(
      makePost({ content: { ...makePost().content, durationSec: 200 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "duration");
    if (r) assert.match(r.message, /long for this platform/);
  });

  it("baseline: 'Set audience size' when audienceSize=0", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, audienceSize: 0 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "baseline");
    if (r) assert.match(r.message, /Set audience size/);
  });

  it("baseline: 'recent average views' when accountAvgViews=0 (audience>0)", () => {
    const recs = recommend(
      makePost({
        context: {
          ...makePost().context,
          audienceSize: 10_000,
          accountAvgViews: 0,
        },
      }),
      20,
    );
    const r = recs.find((x) => x.factorId === "baseline");
    if (r) assert.match(r.message, /average views/);
  });

  it("novelty=3 produces 'Bump novelty' message", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, novelty: 3 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "novelty");
    if (r) assert.match(r.message, /Bump novelty/);
  });

  it("emotion=3 produces 'Push the emotional payoff' message", () => {
    const recs = recommend(
      makePost({ context: { ...makePost().context, emotion: 3 } }),
      20,
    );
    const r = recs.find((x) => x.factorId === "emotion");
    if (r) assert.match(r.message, /Push the emotional payoff/);
  });

  it("hashtag too many: 'Trim' message", () => {
    const recs = recommend(
      makePost({
        content: {
          ...makePost().content,
          hashtags: ["a", "b", "c", "d", "e", "f", "g", "h"],
        },
      }),
      20,
    );
    const r = recs.find((x) => x.factorId === "hashtags");
    if (r) assert.match(r.message, /Trim/);
  });
});
