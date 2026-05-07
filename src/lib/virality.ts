import {
  EngagementSnapshot,
  Platform,
  Post,
  PostFormat,
  ScoreBand,
  SCORE_BANDS,
  ScoreFactor,
  ViralityScore,
} from "./types";

/**
 * Virality scoring engine.
 *
 * Pure, deterministic, transparent. Every score reduces to a list of named
 * factors with raw quality (0..1), platform weight (0..1), and a contribution
 * (raw * weight * 100). Sum of weights per platform is normalized to 1, so
 * total score is on a 0..100 scale.
 *
 * The implementation is intentionally a heuristic — it captures qualitative
 * findings from social-media research (hook strength, format-platform fit,
 * post timing, share-rate-per-impression as the strongest live signal) so it
 * acts as a useful decision tool without pretending to be an ML model. The
 * shape of {value, factors, band, confidence} matches what a real backend
 * predictor would return, so swapping in an API later is a one-line change.
 */

// ── Platform fit profiles ────────────────────────────────────────────────────
// Numbers are *target* values for each platform; quality fades as you drift
// away from the target (modeled by `bell` below).

interface PlatformProfile {
  formatPreference: Record<PostFormat, number>; // 0..1 quality for each
  videoTargetSec?: { ideal: number; min: number; max: number };
  captionSweet: { ideal: number; tolerance: number };
  hashtagsSweet: { ideal: number; tolerance: number };
  peakHours: number[]; // local hours
  peakDays: number[]; // 0=sun..6=sat
  weights: PlatformWeights;
  intrinsicWeights: IntrinsicWeights;
  liveWeights: LiveWeights;
  baselineMultiplier: number;
}

interface PlatformWeights {
  // weight of intrinsic vs live in blended live score, by snapshot age
  // age in minutes -> live weight (0..1)
  liveCurve: (ageMinutes: number) => number;
}

interface IntrinsicWeights {
  hook: number;
  caption: number;
  hashtags: number;
  format: number;
  duration: number;
  novelty: number;
  emotion: number;
  trendMatch: number;
  trendingAudio: number;
  postingTime: number;
  baseline: number;
  sentiment: number;
}

interface LiveWeights {
  shareRate: number;
  saveRate: number;
  engagementRate: number;
  retention: number;
  velocity: number;
  commentDepth: number;
}

const NORMALIZE = (w: Record<string, number>): Record<string, number> => {
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(
    Object.entries(w).map(([k, v]) => [k, v / total]),
  ) as Record<string, number>;
};

const PROFILES: Record<Platform, PlatformProfile> = {
  tiktok: profile({
    formatPreference: { video: 1, live: 0.4, image: 0.1, carousel: 0.1, text: 0 },
    videoTargetSec: { ideal: 21, min: 8, max: 60 },
    captionSweet: { ideal: 90, tolerance: 70 },
    hashtagsSweet: { ideal: 4, tolerance: 3 },
    peakHours: [7, 8, 9, 12, 19, 20, 21, 22],
    peakDays: [2, 3, 4, 6],
    intrinsicWeights: {
      hook: 22, caption: 6, hashtags: 6, format: 12, duration: 10,
      novelty: 9, emotion: 9, trendMatch: 9, trendingAudio: 9,
      postingTime: 4, baseline: 2, sentiment: 2,
    },
    liveWeights: {
      shareRate: 28, saveRate: 8, engagementRate: 10,
      retention: 32, velocity: 16, commentDepth: 6,
    },
    baselineMultiplier: 8,
    liveCurveSlope: 0.012,
  }),
  reels: profile({
    formatPreference: { video: 1, live: 0.3, carousel: 0.5, image: 0.2, text: 0 },
    videoTargetSec: { ideal: 18, min: 7, max: 60 },
    captionSweet: { ideal: 110, tolerance: 80 },
    hashtagsSweet: { ideal: 5, tolerance: 3 },
    peakHours: [11, 12, 13, 17, 18, 19, 20, 21],
    peakDays: [2, 3, 4, 5],
    intrinsicWeights: {
      hook: 20, caption: 8, hashtags: 7, format: 11, duration: 9,
      novelty: 10, emotion: 9, trendMatch: 9, trendingAudio: 8,
      postingTime: 4, baseline: 3, sentiment: 2,
    },
    liveWeights: {
      shareRate: 24, saveRate: 16, engagementRate: 10,
      retention: 28, velocity: 16, commentDepth: 6,
    },
    baselineMultiplier: 7,
    liveCurveSlope: 0.011,
  }),
  shorts: profile({
    formatPreference: { video: 1, live: 0.4, image: 0.0, carousel: 0.0, text: 0 },
    videoTargetSec: { ideal: 28, min: 10, max: 60 },
    captionSweet: { ideal: 80, tolerance: 60 },
    hashtagsSweet: { ideal: 3, tolerance: 2 },
    peakHours: [12, 17, 18, 19, 20, 21, 22],
    peakDays: [3, 4, 5, 6],
    intrinsicWeights: {
      hook: 24, caption: 5, hashtags: 4, format: 12, duration: 11,
      novelty: 9, emotion: 8, trendMatch: 7, trendingAudio: 6,
      postingTime: 6, baseline: 4, sentiment: 4,
    },
    liveWeights: {
      shareRate: 20, saveRate: 8, engagementRate: 10,
      retention: 36, velocity: 18, commentDepth: 8,
    },
    baselineMultiplier: 6,
    liveCurveSlope: 0.010,
  }),
  instagram_feed: profile({
    formatPreference: { carousel: 1, image: 0.85, video: 0.7, live: 0.2, text: 0 },
    captionSweet: { ideal: 140, tolerance: 110 },
    hashtagsSweet: { ideal: 6, tolerance: 4 },
    peakHours: [11, 12, 13, 19, 20, 21],
    peakDays: [2, 3, 4],
    intrinsicWeights: {
      hook: 14, caption: 14, hashtags: 9, format: 12, duration: 0,
      novelty: 10, emotion: 10, trendMatch: 8, trendingAudio: 0,
      postingTime: 8, baseline: 8, sentiment: 7,
    },
    liveWeights: {
      shareRate: 18, saveRate: 26, engagementRate: 16,
      retention: 0, velocity: 22, commentDepth: 18,
    },
    baselineMultiplier: 5,
    liveCurveSlope: 0.009,
  }),
  x: profile({
    formatPreference: { text: 1, image: 0.85, video: 0.7, carousel: 0.5, live: 0.4 },
    captionSweet: { ideal: 120, tolerance: 90 },
    hashtagsSweet: { ideal: 1, tolerance: 1 },
    peakHours: [8, 9, 10, 12, 13, 17, 18, 21, 22],
    peakDays: [1, 2, 3, 4, 5],
    intrinsicWeights: {
      hook: 22, caption: 14, hashtags: 3, format: 7, duration: 0,
      novelty: 10, emotion: 12, trendMatch: 12, trendingAudio: 0,
      postingTime: 8, baseline: 6, sentiment: 6,
    },
    liveWeights: {
      shareRate: 28, saveRate: 4, engagementRate: 14,
      retention: 0, velocity: 30, commentDepth: 24,
    },
    baselineMultiplier: 4,
    liveCurveSlope: 0.014,
  }),
  threads: profile({
    formatPreference: { text: 1, image: 0.7, video: 0.5, carousel: 0.5, live: 0.0 },
    captionSweet: { ideal: 180, tolerance: 130 },
    hashtagsSweet: { ideal: 0, tolerance: 1 },
    peakHours: [8, 9, 12, 18, 19, 21],
    peakDays: [1, 2, 3, 4],
    intrinsicWeights: {
      hook: 20, caption: 18, hashtags: 1, format: 7, duration: 0,
      novelty: 12, emotion: 10, trendMatch: 8, trendingAudio: 0,
      postingTime: 6, baseline: 8, sentiment: 10,
    },
    liveWeights: {
      shareRate: 22, saveRate: 4, engagementRate: 18,
      retention: 0, velocity: 28, commentDepth: 28,
    },
    baselineMultiplier: 4,
    liveCurveSlope: 0.012,
  }),
  linkedin: profile({
    formatPreference: { text: 1, carousel: 0.85, image: 0.7, video: 0.6, live: 0.3 },
    captionSweet: { ideal: 1200, tolerance: 800 },
    hashtagsSweet: { ideal: 3, tolerance: 2 },
    peakHours: [7, 8, 9, 12, 13, 17],
    peakDays: [1, 2, 3, 4],
    intrinsicWeights: {
      hook: 18, caption: 18, hashtags: 4, format: 8, duration: 0,
      novelty: 8, emotion: 8, trendMatch: 7, trendingAudio: 0,
      postingTime: 12, baseline: 9, sentiment: 8,
    },
    liveWeights: {
      shareRate: 14, saveRate: 6, engagementRate: 14,
      retention: 0, velocity: 24, commentDepth: 42,
    },
    baselineMultiplier: 3,
    liveCurveSlope: 0.007,
  }),
  facebook: profile({
    formatPreference: { video: 1, image: 0.7, carousel: 0.6, text: 0.5, live: 0.85 },
    videoTargetSec: { ideal: 60, min: 15, max: 180 },
    captionSweet: { ideal: 80, tolerance: 60 },
    hashtagsSweet: { ideal: 2, tolerance: 2 },
    peakHours: [9, 13, 15, 19, 20],
    peakDays: [3, 4, 5, 6],
    intrinsicWeights: {
      hook: 16, caption: 10, hashtags: 4, format: 12, duration: 6,
      novelty: 8, emotion: 12, trendMatch: 6, trendingAudio: 0,
      postingTime: 10, baseline: 8, sentiment: 8,
    },
    liveWeights: {
      shareRate: 30, saveRate: 6, engagementRate: 14,
      retention: 14, velocity: 20, commentDepth: 16,
    },
    baselineMultiplier: 4,
    liveCurveSlope: 0.008,
  }),
};

function profile(p: Omit<PlatformProfile, "weights" | "intrinsicWeights" | "liveWeights"> & {
  intrinsicWeights: IntrinsicWeights;
  liveWeights: LiveWeights;
  liveCurveSlope: number;
}): PlatformProfile {
  const intrinsic = NORMALIZE(p.intrinsicWeights as unknown as Record<string, number>);
  const live = NORMALIZE(p.liveWeights as unknown as Record<string, number>);
  return {
    ...p,
    intrinsicWeights: intrinsic as unknown as IntrinsicWeights,
    liveWeights: live as unknown as LiveWeights,
    weights: {
      // Smooth ramp from ~0.2 at t=0 (signal still noisy) to ~0.85 by 60 min.
      liveCurve: (m) => clamp(0.2 + p.liveCurveSlope * m, 0.2, 0.85),
    },
  };
}

// ── Quality functions ────────────────────────────────────────────────────────

function clamp(n: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Bell curve that peaks at `ideal` and fades over `tolerance`. */
function bell(value: number, ideal: number, tolerance: number): number {
  if (tolerance <= 0) return value === ideal ? 1 : 0;
  const dx = (value - ideal) / tolerance;
  return clamp(Math.exp(-(dx * dx)), 0, 1);
}

function hookQuality(hook: string): number {
  const trimmed = hook.trim();
  if (!trimmed) return 0;
  const words = trimmed.split(/\s+/);
  const lengthScore = bell(words.length, 6, 4);
  const punch =
    /[?!]/.test(trimmed) ? 0.15 :
    /\d/.test(trimmed) ? 0.1 : 0;
  const opener = /^(you|why|how|what|when|stop|never|i|the|this|here|imagine|nobody|everyone)\b/i
    .test(trimmed) ? 0.15 : 0;
  const verbs = /\b(stop|try|watch|see|read|wait|listen|stop|fix|crush|destroy|reveal|expose)\b/i
    .test(trimmed) ? 0.1 : 0;
  return clamp(lengthScore + punch + opener + verbs);
}

function captionQuality(caption: string, sweet: { ideal: number; tolerance: number }): number {
  const len = caption.trim().length;
  if (len === 0) return 0.2; // empty caption is rarely fatal but rarely great
  return bell(len, sweet.ideal, sweet.tolerance);
}

function hashtagQuality(tags: string[], sweet: { ideal: number; tolerance: number }): number {
  return bell(tags.length, sweet.ideal, sweet.tolerance);
}

function formatQuality(format: PostFormat, prefs: Record<PostFormat, number>): number {
  return clamp(prefs[format] ?? 0);
}

function durationQuality(durationSec: number | undefined, target: PlatformProfile["videoTargetSec"]): number {
  if (!target) return 1;
  if (durationSec == null) return 0.6; // unknown — neutral
  if (durationSec < target.min) return clamp(durationSec / target.min);
  if (durationSec > target.max) return clamp(target.max / durationSec * 0.7);
  return bell(durationSec, target.ideal, (target.max - target.min) / 2);
}

function timingQuality(hour: number, day: number, profile: PlatformProfile): number {
  const hourBonus = profile.peakHours.includes(hour) ? 1 : 0.55;
  const dayBonus = profile.peakDays.includes(day) ? 1 : 0.7;
  return clamp(0.55 * hourBonus + 0.45 * dayBonus);
}

function baselineQuality(audienceSize: number, accountAvgViews: number, mult: number): number {
  if (audienceSize <= 0) return 0.4;
  const ratio = accountAvgViews / audienceSize;
  return clamp(ratio * mult);
}

function sentimentQuality(sentiment: string): number {
  // Strong sentiment outperforms neutral on every platform; controversy spikes
  // shares but caps virality due to platform suppression.
  switch (sentiment) {
    case "positive": return 0.85;
    case "negative": return 0.7;
    case "controversial": return 0.95;
    case "neutral":
    default: return 0.45;
  }
}

// ── Score assembly ───────────────────────────────────────────────────────────

export function scoreIntrinsic(post: Post): ViralityScore {
  const p = PROFILES[post.platform];
  const c = post.content;
  const ctx = post.context;

  const factors: ScoreFactor[] = [
    f("hook", "Hook strength", "content", hookQuality(c.hook), p.intrinsicWeights.hook,
      "First-line punch: ideal 4-8 words with curiosity, contrast, or a number."),
    f("caption", "Caption fit", "content", captionQuality(c.caption, p.captionSweet), p.intrinsicWeights.caption,
      `Best near ${p.captionSweet.ideal} chars on ${labelFor(post.platform)}.`),
    f("hashtags", "Hashtag count", "content", hashtagQuality(c.hashtags, p.hashtagsSweet), p.intrinsicWeights.hashtags,
      `Aim for ~${p.hashtagsSweet.ideal} hashtags here.`),
    f("format", "Format fit", "content", formatQuality(c.format, p.formatPreference), p.intrinsicWeights.format,
      `Highest performing format on ${labelFor(post.platform)} is ${bestFormat(p.formatPreference)}.`),
    f("duration", "Length", "content", durationQuality(c.durationSec, p.videoTargetSec), p.intrinsicWeights.duration,
      p.videoTargetSec
        ? `Target ${p.videoTargetSec.ideal}s (range ${p.videoTargetSec.min}-${p.videoTargetSec.max}s).`
        : "Length doesn't apply on this platform."),
    f("novelty", "Novelty", "content", linear5(ctx.novelty), p.intrinsicWeights.novelty,
      "Self-rated 1-5: how often have viewers seen this take?"),
    f("emotion", "Emotional charge", "content", linear5(ctx.emotion), p.intrinsicWeights.emotion,
      "Strong emotion (delight, anger, awe) drives shares."),
    f("trendMatch", "Trend match", "content", linear5(ctx.trendMatch), p.intrinsicWeights.trendMatch,
      "How well this rides a current trend cluster."),
    f("trendingAudio", "Trending audio", "content", c.hasTrendingAudio ? 1 : 0, p.intrinsicWeights.trendingAudio,
      "Trending audio is a major TikTok/Reels lever."),
    f("postingTime", "Posting time", "context", timingQuality(ctx.postingHour, ctx.dayOfWeek, p), p.intrinsicWeights.postingTime,
      `Peak hours: ${p.peakHours.join(", ")}.`),
    f("baseline", "Account baseline", "context", baselineQuality(ctx.audienceSize, ctx.accountAvgViews, p.baselineMultiplier), p.intrinsicWeights.baseline,
      "Bigger reach baseline lifts the floor of any post."),
    f("sentiment", "Sentiment edge", "context", sentimentQuality(ctx.sentiment), p.intrinsicWeights.sentiment,
      "Strong-sentiment content outperforms neutral content."),
  ].filter((x) => x.weight > 0);

  return assemble(factors, /* confidence */ 0.45);
}

export function scoreLive(post: Post): ViralityScore | undefined {
  if (post.snapshots.length === 0) return undefined;
  const p = PROFILES[post.platform];
  const intrinsic = scoreIntrinsic(post);
  const latest = [...post.snapshots].sort((a, b) => a.atMinutes - b.atMinutes).slice(-1)[0];
  const prev = post.snapshots.length > 1
    ? [...post.snapshots].sort((a, b) => a.atMinutes - b.atMinutes).slice(-2, -1)[0]
    : undefined;

  const tractionFactors = buildTractionFactors(latest, prev, p);
  const liveOnly = assemble(tractionFactors, 0.7);

  const liveW = p.weights.liveCurve(latest.atMinutes);
  const blendedValue = liveOnly.value * liveW + intrinsic.value * (1 - liveW);

  // Merge factor lists: intrinsic factors get scaled down, live get scaled up.
  const merged: ScoreFactor[] = [
    ...intrinsic.factors.map((f) => ({ ...f, contribution: f.contribution * (1 - liveW) })),
    ...liveOnly.factors.map((f) => ({ ...f, contribution: f.contribution * liveW })),
  ];

  return {
    value: round(blendedValue),
    band: bandFor(blendedValue),
    confidence: clamp(0.45 + 0.5 * liveW),
    factors: merged,
    computedAt: new Date().toISOString(),
  };
}

function buildTractionFactors(
  latest: EngagementSnapshot,
  prev: EngagementSnapshot | undefined,
  p: PlatformProfile,
): ScoreFactor[] {
  const impressions = Math.max(latest.impressions, latest.views, 1);
  const shareRate = latest.shares / impressions;
  const saveRate = latest.saves / impressions;
  const er = (latest.likes + latest.comments * 2 + latest.shares * 3) / impressions;
  const retention = (latest.retentionPct ?? 0) / 100;

  const velocity = prev
    ? (latest.views - prev.views) /
      Math.max(latest.atMinutes - prev.atMinutes, 1) /
      Math.max(prev.views || 1, 1)
    : latest.views / Math.max(latest.atMinutes, 1) / Math.max(latest.views, 1);

  const commentDepth = latest.likes > 0
    ? clamp(latest.comments / latest.likes * 5)
    : clamp(latest.comments / 50);

  // Map raw rates to 0..1 — these are tuned to the rough log-scale of "viral".
  const norm = {
    shareRate: clamp(shareRate / 0.02), // 2% share rate ~= rocket
    saveRate: clamp(saveRate / 0.04),
    engagementRate: clamp(er / 0.15),
    retention: clamp(retention / 0.6), // 60% retention ~= elite
    velocity: clamp(velocity * 8),
    commentDepth: clamp(commentDepth),
  };

  return [
    f("shareRate", "Share rate", "diffusion", norm.shareRate, p.liveWeights.shareRate,
      `${pct(shareRate)} of impressions shared — strongest single virality signal.`),
    f("saveRate", "Save rate", "traction", norm.saveRate, p.liveWeights.saveRate,
      `${pct(saveRate)} of impressions saved.`),
    f("engagementRate", "Engagement rate", "traction", norm.engagementRate, p.liveWeights.engagementRate,
      `Weighted ER (likes + 2×comments + 3×shares) per impression.`),
    f("retention", "Retention", "traction", norm.retention, p.liveWeights.retention,
      `Average retention ${(retention * 100).toFixed(0)}% — drives algorithmic boost.`),
    f("velocity", "Velocity", "traction", norm.velocity, p.liveWeights.velocity,
      "How fast views are accelerating between snapshots."),
    f("commentDepth", "Comment depth", "diffusion", norm.commentDepth, p.liveWeights.commentDepth,
      "Comments-per-like; signals real conversation, not just passive likes."),
  ].filter((x) => x.weight > 0);
}

function f(
  id: string,
  label: string,
  group: ScoreFactor["group"],
  raw: number,
  weight: number,
  hint: string,
): ScoreFactor {
  const r = clamp(raw);
  return { id, label, group, raw: r, weight, contribution: r * weight * 100, hint };
}

function assemble(factors: ScoreFactor[], confidence: number): ViralityScore {
  const value = round(factors.reduce((s, f) => s + f.contribution, 0));
  return {
    value,
    band: bandFor(value),
    confidence,
    factors,
    computedAt: new Date().toISOString(),
  };
}

function bandFor(value: number): ScoreBand {
  let band: ScoreBand = "flop";
  for (const b of SCORE_BANDS) {
    if (value >= b.min) band = b.id;
  }
  return band;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function linear5(v: 1 | 2 | 3 | 4 | 5): number {
  return (v - 1) / 4;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function bestFormat(prefs: Record<PostFormat, number>): string {
  return Object.entries(prefs).sort((a, b) => b[1] - a[1])[0][0];
}

function labelFor(platform: Platform): string {
  return platform.replace("_", " ");
}

// ── Public helpers ───────────────────────────────────────────────────────────

export function platformProfile(platform: Platform): PlatformProfile {
  return PROFILES[platform];
}

export function describeBand(band: ScoreBand): { label: string; tone: string } {
  switch (band) {
    case "flop": return { label: "Flop risk", tone: "#dc2626" };
    case "meh": return { label: "Meh", tone: "#737373" };
    case "solid": return { label: "Solid", tone: "#3b82f6" };
    case "hot": return { label: "Hot", tone: "#ff5c1a" };
    case "rocket": return { label: "Rocket", tone: "#c4f000" };
  }
}

// ── Recommendations ─────────────────────────────────────────────────────────

export interface Recommendation {
  factorId: string;
  label: string;
  message: string;
  potentialGain: number; // estimated score points if recommendation applied
}

/**
 * Turn a score's weakest factors into actionable, platform-aware suggestions.
 * Only intrinsic factors are recommendable (live engagement isn't something
 * you can edit retroactively). Sorted by potential gain, capped at `max`.
 */
export function recommend(post: Post, max = 4): Recommendation[] {
  const score = scoreIntrinsic(post);
  const profile = PROFILES[post.platform];
  const out: Recommendation[] = [];

  for (const f of score.factors) {
    if (f.raw >= 0.85) continue; // already strong, ignore
    const headroom = (1 - f.raw) * f.weight * 100;
    if (headroom < 1.5) continue; // not enough upside to bother
    const message = messageFor(f.id, post, profile);
    if (!message) continue;
    out.push({
      factorId: f.id,
      label: f.label,
      message,
      potentialGain: round(headroom),
    });
  }

  return out.sort((a, b) => b.potentialGain - a.potentialGain).slice(0, max);
}

function messageFor(
  factorId: string,
  post: Post,
  profile: PlatformProfile,
): string | undefined {
  const c = post.content;
  const ctx = post.context;
  switch (factorId) {
    case "hook": {
      const words = c.hook.trim().split(/\s+/).filter(Boolean).length;
      if (words === 0) return "Add a hook — first line carries the post.";
      if (words < 4) return `Hook is ${words} words; aim for 4–8 with a verb or question.`;
      if (words > 12) return `Hook is ${words} words; tighten to under 10.`;
      return "Add a number, question, or contrast to strengthen the hook.";
    }
    case "caption": {
      const len = c.caption.trim().length;
      const target = profile.captionSweet.ideal;
      if (len === 0) return `Caption is empty; ${labelFor(post.platform)} performs best near ${target} chars.`;
      const off = len - target;
      if (Math.abs(off) < profile.captionSweet.tolerance / 2) return undefined;
      return off < 0
        ? `Caption is ${len} chars; push toward ~${target} for ${labelFor(post.platform)}.`
        : `Caption is ${len} chars; trim toward ~${target} for ${labelFor(post.platform)}.`;
    }
    case "hashtags": {
      const target = profile.hashtagsSweet.ideal;
      const diff = c.hashtags.length - target;
      if (diff === 0) return undefined;
      return diff < 0
        ? `Add ${-diff} more hashtag${-diff === 1 ? "" : "s"} (target ~${target}).`
        : `Trim ${diff} hashtag${diff === 1 ? "" : "s"} (target ~${target}).`;
    }
    case "format": {
      const best = bestFormat(profile.formatPreference) as PostFormat;
      if (c.format === best) return undefined;
      return `${labelFor(post.platform)} rewards ${best} most; consider switching from ${c.format}.`;
    }
    case "duration": {
      const t = profile.videoTargetSec;
      if (!t || c.format !== "video" && c.format !== "live") return undefined;
      if (c.durationSec == null) return `Set the video duration — target ${t.ideal}s.`;
      if (c.durationSec < t.min) return `${c.durationSec}s is too short; aim for ${t.ideal}s.`;
      if (c.durationSec > t.max) return `${c.durationSec}s is long for this platform; target ${t.ideal}s.`;
      const off = Math.abs(c.durationSec - t.ideal);
      if (off > 8) return `Trim toward ${t.ideal}s — current ${c.durationSec}s is off-target.`;
      return undefined;
    }
    case "novelty":
      return ctx.novelty <= 2
        ? "Novelty is low — re-angle the hook or take a contrarian stance."
        : ctx.novelty === 3
          ? "Bump novelty: lead with what's genuinely new here."
          : undefined;
    case "emotion":
      return ctx.emotion <= 2
        ? "Inject more emotional charge — surprise, awe, or stakes."
        : ctx.emotion === 3
          ? "Push the emotional payoff one notch harder."
          : undefined;
    case "trendMatch":
      return ctx.trendMatch <= 2
        ? "Tie the post to a current trend cluster — search the platform first."
        : undefined;
    case "trendingAudio":
      if (post.platform !== "tiktok" && post.platform !== "reels") return undefined;
      return c.hasTrendingAudio
        ? undefined
        : "Layer a currently trending audio for an algorithmic boost.";
    case "postingTime": {
      const peakHrs = profile.peakHours.join(", ");
      const peakDays = profile.peakDays
        .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
        .join("/");
      const hourOK = profile.peakHours.includes(ctx.postingHour);
      const dayOK = profile.peakDays.includes(ctx.dayOfWeek);
      if (hourOK && dayOK) return undefined;
      if (!hourOK && !dayOK) return `Move to a peak window: ${peakDays} at ${peakHrs}.`;
      if (!hourOK) return `Shift posting hour into the peak window: ${peakHrs}.`;
      return `Shift to a peak day for ${labelFor(post.platform)}: ${peakDays}.`;
    }
    case "baseline":
      if (ctx.audienceSize <= 0) return "Set audience size to calibrate the baseline.";
      if (ctx.accountAvgViews <= 0) return "Add recent average views — virality is relative to baseline.";
      return undefined;
    case "sentiment":
      return ctx.sentiment === "neutral"
        ? "Strong-sentiment posts outperform neutral ones — pick a clear stance."
        : undefined;
    default:
      return undefined;
  }
}

// ── Viral threshold projection ──────────────────────────────────────────────

export interface ViralProjection {
  metric: "views" | "shares" | "engagement_rate";
  threshold: number;
  windowMinutes: number;
  projected: number; // projected metric value at end of window
  probability: number; // 0..1
  basisMinutes: number; // how much data we have
}

const WINDOW_MINUTES: Record<"24h" | "7d" | "30d", number> = {
  "24h": 24 * 60,
  "7d": 7 * 24 * 60,
  "30d": 30 * 24 * 60,
};

/**
 * Project whether the post will hit its threshold by the end of its window,
 * using a simple log-linear extrapolation: viral content typically follows a
 * concave curve where most growth happens early. We fit `value = A * log(t+1)`
 * to the latest snapshots and extrapolate forward.
 */
export function projectThreshold(post: Post): ViralProjection | undefined {
  const win = WINDOW_MINUTES[post.threshold.window];
  if (post.snapshots.length === 0) return undefined;
  const sorted = [...post.snapshots].sort((a, b) => a.atMinutes - b.atMinutes);
  const latest = sorted[sorted.length - 1];

  let metricNow: number;
  switch (post.threshold.metric) {
    case "views":
      metricNow = latest.views || latest.impressions;
      break;
    case "shares":
      metricNow = latest.shares;
      break;
    case "engagement_rate": {
      const imp = Math.max(latest.impressions, latest.views, 1);
      metricNow = (latest.likes + latest.comments + latest.shares) / imp;
      break;
    }
  }

  // Log-linear extrapolation: scale current value by ratio of log(win)/log(t).
  const t = Math.max(latest.atMinutes, 1);
  const factor = Math.log(win + 1) / Math.log(t + 1);
  const projected = metricNow * factor;

  const ratio = post.threshold.value > 0 ? projected / post.threshold.value : 0;
  const probability = clamp(sigmoid((ratio - 1) * 1.5));

  return {
    metric: post.threshold.metric,
    threshold: post.threshold.value,
    windowMinutes: win,
    projected,
    probability,
    basisMinutes: latest.atMinutes,
  };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
