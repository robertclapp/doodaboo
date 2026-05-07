"use client";

import { Platform } from "@/lib/types";

// For platforms whose brand bg is near-black we let the bg/fg track the
// theme tokens (bg-ink/text-paper inverts cleanly in dark mode); the rest
// keep their saturated brand color since those read fine on either theme.
const CLASSES: Record<Platform, string> = {
  tiktok: "bg-ink text-[#c4f000]",
  x: "bg-ink text-paper",
  threads: "bg-ink-soft text-paper",
  reels: "bg-[#dc2626] text-paper",
  shorts: "bg-[#dc2626] text-paper",
  instagram_feed: "bg-[#ff5c1a] text-paper",
  linkedin: "bg-[#3b4ae4] text-paper",
  facebook: "bg-[#3b4ae4] text-paper",
};

const GLYPH: Record<Platform, string> = {
  tiktok: "TT",
  reels: "RL",
  shorts: "YS",
  instagram_feed: "IG",
  x: "X",
  threads: "TH",
  linkedin: "LI",
  facebook: "FB",
};

export function PlatformIcon({
  platform,
  size = 20,
}: {
  platform: Platform;
  size?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
      }}
      className={`inline-flex items-center justify-center border-[1.5px] border-ink font-mono font-bold tracking-tight ${CLASSES[platform]}`}
      aria-label={platform}
    >
      {GLYPH[platform]}
    </span>
  );
}
