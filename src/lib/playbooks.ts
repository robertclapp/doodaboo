import { Platform, Post, PostContext, PostContent, PostFormat } from "./types";
import { platformProfile } from "./virality";

/**
 * Playbooks are pre-built recipes for a kind of post — a "3-second hook"
 * for TikTok, an "X funnel" thread starter, a "founder essay" for LinkedIn.
 *
 * Each playbook declares which platforms it targets and an `apply` function
 * that returns a partial Post patch. Applying a playbook never overwrites
 * non-empty user content unless `aggressive: true` — instead it suggests
 * defaults for empty fields, sets the format/duration/hashtag count toward
 * the platform's sweet spot, and aligns the posting time with peak hours.
 *
 * The score predictor needs no awareness of playbooks: a playbook's only
 * job is to nudge a Post toward strong intrinsic factors. Apply, then let
 * `scoreIntrinsic` rate the result.
 */

export interface Playbook {
  id: string;
  name: string;
  description: string;
  platforms: Platform[];
  category:
    | "hook"
    | "thread"
    | "carousel"
    | "longform"
    | "trend"
    | "engagement";
  hookHint?: string;
  captionHint?: string;
  defaultHashtags?: string[];
  format?: PostFormat;
  durationOverride?: number;
  contextDefaults?: Partial<PostContext>;
  contentDefaults?: Partial<PostContent>;
  notes: string[];
}

export interface ApplyResult {
  patch: { content: PostContent; context: PostContext };
  changes: string[];
  before: { hookEmpty: boolean; captionEmpty: boolean };
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: "pb_3s_hook",
    name: "3-second hook",
    description:
      "The classic short-form opener: hook in the first three seconds, payoff before second 21, ride a trending audio.",
    platforms: ["tiktok", "reels", "shorts"],
    category: "hook",
    hookHint:
      "Open with a contrarian claim or a number. Example: \"Stop using X — this is faster.\"",
    captionHint:
      "1–2 lines. Tease the payoff, end with a question to provoke a comment.",
    defaultHashtags: ["fyp", "trending", "build"],
    format: "video",
    durationOverride: 21,
    contextDefaults: {
      novelty: 4,
      emotion: 4,
      trendMatch: 4,
      sentiment: "controversial",
    },
    contentDefaults: { hasTrendingAudio: true },
    notes: [
      "Cold-opens beat slow intros — no logo, no \"hey guys\".",
      "If retention dies before 6s, the hook is the problem.",
    ],
  },
  {
    id: "pb_curiosity_gap",
    name: "Curiosity gap",
    description:
      "A hook that opens a loop your reader has to close. Strongest on text-first platforms.",
    platforms: ["x", "threads", "linkedin"],
    category: "hook",
    hookHint:
      "Promise a specific reveal. Example: \"I rebuilt my pricing page in one weekend. The result surprised me.\"",
    captionHint:
      "Deliver in tight beats. Don't bury the payoff past line 3.",
    contextDefaults: {
      novelty: 4,
      emotion: 4,
      sentiment: "positive",
    },
    notes: [
      "Closing the loop in the same post earns saves and shares.",
      "Avoid hooks that feel like clickbait — readers punish them.",
    ],
  },
  {
    id: "pb_x_funnel",
    name: "X funnel",
    description:
      "A self-contained thread that ends with a soft CTA — newsletter, demo, or DM.",
    platforms: ["x", "threads"],
    category: "thread",
    hookHint:
      "Lead with a result and a number. Example: \"We grew to 10k followers in 60 days. Here's what worked:\"",
    captionHint:
      "5–8 punchy lines, one beat per line. End with a clear ask.",
    defaultHashtags: [],
    contextDefaults: {
      postingHour: 9,
      dayOfWeek: 2,
      novelty: 4,
      emotion: 3,
      trendMatch: 3,
      sentiment: "positive",
    },
    notes: [
      "Ship between 8–10am or 5–9pm in your audience's TZ.",
      "Reply to your own tweet with the CTA — keeps reply velocity high.",
    ],
  },
  {
    id: "pb_carousel_save",
    name: "Carousel save-bait",
    description:
      "A 5–10 slide list designed to be saved and revisited. Built for IG feed.",
    platforms: ["instagram_feed"],
    category: "carousel",
    hookHint:
      "Lead with a number and a promise. Example: \"7 brutalist UI patterns that don't suck.\"",
    captionHint:
      "Reinforce the saveable nature. Example: \"Save this for your next redesign.\"",
    defaultHashtags: ["uidesign", "brutalism", "designsystems", "ui", "uxdesign"],
    format: "carousel",
    contextDefaults: {
      postingHour: 12,
      dayOfWeek: 3,
      novelty: 4,
      emotion: 3,
      trendMatch: 3,
    },
    notes: [
      "Slide 1 is a recruiter — it has to stop the scroll alone.",
      "End with a CTA slide that tells people to save and share.",
    ],
  },
  {
    id: "pb_founder_essay",
    name: "Founder essay",
    description:
      "Long-form professional narrative. Highest-share format on LinkedIn.",
    platforms: ["linkedin"],
    category: "longform",
    hookHint:
      "Open with a personal stake. Example: \"Last month I left a top AI lab. Here's what nobody tells you.\"",
    captionHint:
      "1,000–1,500 chars, broken into one-line paragraphs. Concrete details, no fluff.",
    defaultHashtags: ["careers", "leadership"],
    format: "text",
    contextDefaults: {
      postingHour: 8,
      dayOfWeek: 2,
      novelty: 3,
      emotion: 4,
      trendMatch: 3,
      sentiment: "positive",
    },
    notes: [
      "Tuesday/Wednesday between 7–9am is the LinkedIn sweet spot.",
      "Reply to your own first comment within 30 minutes to compound reach.",
    ],
  },
  {
    id: "pb_trend_surf",
    name: "Trend surf",
    description:
      "Latch onto a current trending audio or topic cluster within 24 hours of it taking off.",
    platforms: ["tiktok", "reels", "shorts"],
    category: "trend",
    hookHint:
      "Hijack the trend's framing in line one. Example: \"Everyone's doing X — here's why it's wrong.\"",
    captionHint:
      "Short. Let the audio do most of the work.",
    defaultHashtags: ["fyp", "trending"],
    format: "video",
    durationOverride: 18,
    contextDefaults: {
      novelty: 3,
      emotion: 4,
      trendMatch: 5,
      sentiment: "positive",
    },
    contentDefaults: { hasTrendingAudio: true },
    notes: [
      "Speed > polish. A trend window is 36–72 hours.",
      "Verify the audio is still rising before committing 4 hours to editing.",
    ],
  },
  {
    id: "pb_reaction_bait",
    name: "Reaction bait",
    description:
      "A clear, defensible take that invites disagreement. Comment-volume play.",
    platforms: ["x", "threads", "linkedin", "facebook"],
    category: "engagement",
    hookHint:
      "State a strong, unhedged opinion. Example: \"Most analytics dashboards are just expensive distractions.\"",
    captionHint:
      "Defend the take in 2–4 lines, then leave a hook for comments.",
    contextDefaults: {
      novelty: 4,
      emotion: 4,
      trendMatch: 3,
      sentiment: "controversial",
    },
    notes: [
      "Engage every reply for the first hour — comment depth feeds the algorithm.",
      "Don't punch down. Controversy on ideas, not people.",
    ],
  },
  {
    id: "pb_value_drop",
    name: "Value drop",
    description:
      "A bookmark-worthy mini guide: 5 tips, 1 framework, no fluff.",
    platforms: [
      "x",
      "threads",
      "instagram_feed",
      "linkedin",
      "tiktok",
      "reels",
    ],
    category: "engagement",
    hookHint:
      "Promise a takeaway. Example: \"5 prompts I actually use every day, ranked.\"",
    captionHint:
      "Numbered list, one line each. Strongest items first and last.",
    defaultHashtags: ["productivity", "ai"],
    contextDefaults: {
      novelty: 4,
      emotion: 3,
      trendMatch: 3,
      sentiment: "positive",
    },
    notes: [
      "Save rate is the metric to chase.",
      "End with: \"Save this one — you'll need it.\"",
    ],
  },
];

export function playbooksFor(platform: Platform): Playbook[] {
  return PLAYBOOKS.filter((p) => p.platforms.includes(platform));
}

export function getPlaybook(id: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.id === id);
}

/**
 * Apply a playbook to a post draft, returning the new content+context plus
 * a list of human-readable changes for a confirmation toast.
 *
 * - Empty fields are filled with playbook defaults.
 * - Format/duration/hashtags/posting time/sentiment etc. are aligned to the
 *   playbook's targets only when the user hasn't already set them away from
 *   the platform default.
 */
export function applyPlaybook(post: Post, playbook: Playbook): ApplyResult {
  const profile = platformProfile(post.platform);
  const changes: string[] = [];
  const before = {
    hookEmpty: post.content.hook.trim() === "",
    captionEmpty: post.content.caption.trim() === "",
  };

  // Start from the user's content untouched. The previous version
  // spread `...playbook.contentDefaults` on top, which silently flipped
  // `hasTrendingAudio` for any user who'd explicitly set it false — the
  // toast then claimed no changes were made. Layer each field with its
  // own rule below so the change log reflects reality.
  const content: PostContent = { ...post.content };
  if (before.hookEmpty && playbook.hookHint) {
    content.hook = playbook.hookHint;
    changes.push("Filled in suggested hook");
  }
  if (before.captionEmpty && playbook.captionHint) {
    content.caption = playbook.captionHint;
    changes.push("Filled in suggested caption");
  }
  if (
    playbook.defaultHashtags &&
    post.content.hashtags.length === 0 &&
    playbook.platforms.includes(post.platform)
  ) {
    content.hashtags = [...playbook.defaultHashtags];
    changes.push(
      `Set ${playbook.defaultHashtags.length} starter hashtag${playbook.defaultHashtags.length === 1 ? "" : "s"}`,
    );
  }
  if (playbook.format && post.content.format !== playbook.format) {
    content.format = playbook.format;
    changes.push(`Switched format to ${playbook.format}`);
  }
  if (
    playbook.durationOverride != null &&
    (content.format === "video" || content.format === "live") &&
    (post.content.durationSec == null ||
      Math.abs(post.content.durationSec - playbook.durationOverride) > 6)
  ) {
    content.durationSec = playbook.durationOverride;
    changes.push(`Set duration to ${playbook.durationOverride}s`);
  }
  if (
    playbook.contentDefaults?.hasTrendingAudio === true &&
    !post.content.hasTrendingAudio
  ) {
    content.hasTrendingAudio = true;
    changes.push("Marked as riding a trending audio");
  }

  // Start from the user's context — we'll layer in playbook defaults
  // explicitly per field so an over-eager spread can't quietly clobber
  // explicit choices. Each rule below either preserves the user's value
  // or replaces it with a recorded change message.
  const context: PostContext = { ...post.context };
  const defaults = playbook.contextDefaults ?? {};

  const userOutsidePeak =
    !profile.peakHours.includes(post.context.postingHour) ||
    !profile.peakDays.includes(post.context.dayOfWeek);
  if (userOutsidePeak && defaults.postingHour != null) {
    context.postingHour = defaults.postingHour;
    if (defaults.dayOfWeek != null) {
      context.dayOfWeek = defaults.dayOfWeek;
    }
    changes.push("Shifted posting time into peak window");
  }

  for (const key of ["novelty", "emotion", "trendMatch"] as const) {
    const target = defaults[key];
    if (target != null && post.context[key] < target) {
      context[key] = target;
      changes.push(`Bumped ${key} to ${target}`);
    }
  }
  if (
    playbook.contextDefaults?.sentiment != null &&
    post.context.sentiment === "neutral"
  ) {
    context.sentiment = playbook.contextDefaults.sentiment;
    changes.push(`Set sentiment to ${playbook.contextDefaults.sentiment}`);
  }

  if (changes.length === 0) {
    changes.push("No changes — your draft already matches this playbook.");
  }

  return { patch: { content, context }, changes, before };
}
