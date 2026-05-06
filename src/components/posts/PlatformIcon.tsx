"use client";

import { Platform } from "@/lib/types";

const PALETTE: Record<Platform, { bg: string; fg: string }> = {
  tiktok: { bg: "#0a0a0a", fg: "#c4f000" },
  reels: { bg: "#dc2626", fg: "#fafaf7" },
  shorts: { bg: "#dc2626", fg: "#fafaf7" },
  instagram_feed: { bg: "#ff5c1a", fg: "#fafaf7" },
  x: { bg: "#0a0a0a", fg: "#fafaf7" },
  threads: { bg: "#171717", fg: "#fafaf7" },
  linkedin: { bg: "#3b4ae4", fg: "#fafaf7" },
  facebook: { bg: "#3b4ae4", fg: "#fafaf7" },
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
  const { bg, fg } = PALETTE[platform];
  return (
    <span
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color: fg,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
      }}
      className="inline-flex items-center justify-center border-[1.5px] border-ink font-mono font-bold tracking-tight"
      aria-label={platform}
    >
      {GLYPH[platform]}
    </span>
  );
}
