import { Platform } from "./types";

/**
 * Hook Lab — rule-based hook generator.
 *
 * Given a `subject` (the thing the post is about) and an optional
 * `audience`, generate a slate of hook variants that follow proven
 * structural patterns. Templates are tagged by platform fit so the lab
 * can rank variants by where the user is shipping.
 *
 * No randomness in the engine itself — same input always returns the
 * same variants in the same order. The lab UI shuffles for variety.
 */

export interface HookTemplate {
  id: string;
  pattern: string;
  family: HookFamily;
  fitsAll?: boolean;
  fits?: Platform[];
  build: (ctx: HookContext) => string;
  why: string;
}

export type HookFamily =
  | "list"
  | "contrarian"
  | "personal"
  | "question"
  | "promise"
  | "warning"
  | "curiosity";

export interface HookContext {
  subject: string;
  audience?: string;
}

export interface HookVariant {
  id: string;
  hook: string;
  template: HookTemplate;
  fits: Platform[];
}

const NUMBERS = [3, 5, 7];

const TEMPLATES: HookTemplate[] = [
  {
    id: "list-n-things",
    family: "list",
    pattern: "{N} {subject} {predicate}",
    fitsAll: true,
    build: ({ subject }) => `${pick(NUMBERS, 0)} ${subject} that nobody is talking about`,
    why: "Numbers + scope-narrowing — proven save-bait pattern.",
  },
  {
    id: "list-n-things-2",
    family: "list",
    pattern: "{N} {subject} I wish I'd known sooner",
    fits: ["instagram_feed", "linkedin", "x", "threads"],
    build: ({ subject }) => `${pick(NUMBERS, 1)} ${subject} I wish I'd known sooner`,
    why: "Personal regret framing earns saves and share-to-friend.",
  },
  {
    id: "stop-x",
    family: "warning",
    pattern: "Stop doing {subject}. Do this instead.",
    fitsAll: true,
    build: ({ subject }) => `Stop ${subject}. Do this instead.`,
    why: "Imperative + open loop. Curiosity gap forces a click.",
  },
  {
    id: "everyone-wrong",
    family: "contrarian",
    pattern: "Most {audience} are wrong about {subject}",
    fits: ["x", "threads", "linkedin", "facebook"],
    build: ({ subject, audience }) =>
      `Most ${audience ?? "people"} are wrong about ${subject}.`,
    why: "Contrarian claim that dares disagreement — comment magnet.",
  },
  {
    id: "tried-for-x-days",
    family: "personal",
    pattern: "I tried {subject} for 30 days. Here's what happened.",
    fitsAll: true,
    build: ({ subject }) =>
      `I tried ${subject} for 30 days. Here's what happened.`,
    why: "Time-bounded experiment + payoff promise. Retention monster.",
  },
  {
    id: "no-one-tells",
    family: "curiosity",
    pattern: "What nobody tells you about {subject}",
    fitsAll: true,
    build: ({ subject }) => `What nobody tells you about ${subject}.`,
    why: "Insider framing — implies access to non-obvious info.",
  },
  {
    id: "why-x",
    family: "question",
    pattern: "Why {subject}?",
    fitsAll: true,
    build: ({ subject }) =>
      `Why ${subject} keeps breaking — and the fix nobody ships.`,
    why: "Pain hook + solution tease.",
  },
  {
    id: "x-but-y",
    family: "contrarian",
    pattern: "{subject}, but actually good",
    fits: ["tiktok", "reels", "shorts", "x", "threads"],
    build: ({ subject }) => `${capitalize(subject)}, but actually good.`,
    why: "Subverts expectations in 4 words. TikTok-native.",
  },
  {
    id: "you-think",
    family: "contrarian",
    pattern: "You think you understand {subject}. You don't.",
    fits: ["x", "threads", "linkedin"],
    build: ({ subject }) =>
      `You think you understand ${subject}. You don't.`,
    why: "Direct address + contradiction. Confrontational hook.",
  },
  {
    id: "the-x-that",
    family: "promise",
    pattern: "The {subject} framework that changed how I {verb}",
    fitsAll: true,
    build: ({ subject }) =>
      `The ${subject} framework that changed everything for me.`,
    why: "Definite article + transformation language.",
  },
  {
    id: "would-you",
    family: "question",
    pattern: "Would you {action} {subject}?",
    fits: ["x", "threads", "linkedin", "facebook"],
    build: ({ subject }) => `Would you ship ${subject} like this? I almost did.`,
    why: "Direct question + personal stake — invites replies.",
  },
  {
    id: "before-after",
    family: "promise",
    pattern: "Before/after {subject}",
    fits: ["instagram_feed", "tiktok", "reels", "shorts"],
    build: ({ subject }) =>
      `Before/after ${subject} — same effort, very different result.`,
    why: "Visual transformation pattern; carousel- and Reels-native.",
  },
  {
    id: "in-x-seconds",
    family: "promise",
    pattern: "{subject} in 10 seconds",
    fits: ["tiktok", "reels", "shorts"],
    build: ({ subject }) => `${capitalize(subject)} in 10 seconds.`,
    why: "Time-promise hook. Forces the asset to be tight.",
  },
  {
    id: "not-what-you-think",
    family: "curiosity",
    pattern: "{subject} isn't what you think",
    fitsAll: true,
    build: ({ subject }) => `${capitalize(subject)} isn't what you think.`,
    why: "Mystery + curiosity gap. Universal hook.",
  },
  {
    id: "i-was-wrong",
    family: "personal",
    pattern: "I was wrong about {subject}",
    fits: ["x", "threads", "linkedin"],
    build: ({ subject }) => `I was wrong about ${subject}. Here's the receipt.`,
    why: "Vulnerability + evidence promise. Long-form gold.",
  },
  {
    id: "rules",
    family: "list",
    pattern: "{N} rules for {subject}",
    fits: ["x", "threads", "linkedin", "instagram_feed"],
    build: ({ subject }) => `${pick(NUMBERS, 2)} rules for ${subject} that I actually follow.`,
    why: "Authoritative voice + numbered scaffold.",
  },
];

export function generateHooks(ctx: HookContext): HookVariant[] {
  const subject = ctx.subject.trim();
  if (!subject) return [];
  return TEMPLATES.map((t) => {
    const hook = t.build(ctx);
    const fits: Platform[] = t.fitsAll
      ? ([
          "tiktok",
          "reels",
          "shorts",
          "x",
          "threads",
          "linkedin",
          "instagram_feed",
          "facebook",
        ] as Platform[])
      : (t.fits ?? []);
    return {
      id: `${t.id}_${slugify(subject)}`,
      hook,
      template: t,
      fits,
    };
  });
}

export function variantsForPlatform(
  variants: HookVariant[],
  platform: Platform | "all",
): HookVariant[] {
  if (platform === "all") return variants;
  return variants.filter((v) => v.fits.includes(platform));
}

export const HOOK_FAMILIES: { id: HookFamily; label: string }[] = [
  { id: "list", label: "List" },
  { id: "contrarian", label: "Contrarian" },
  { id: "personal", label: "Personal" },
  { id: "question", label: "Question" },
  { id: "promise", label: "Promise" },
  { id: "warning", label: "Warning" },
  { id: "curiosity", label: "Curiosity" },
];

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}
