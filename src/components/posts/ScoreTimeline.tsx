"use client";

import { useMemo } from "react";
import { Post } from "@/lib/types";
import { scoreIntrinsic, scoreLive } from "@/lib/virality";

interface Point {
  atMinutes: number;
  value: number;
}

const W = 480;
const H = 120;
const PAD_X = 32;
const PAD_Y = 16;

export function ScoreTimeline({ post }: { post: Post }) {
  const points = useMemo<Point[]>(() => {
    const intrinsic = scoreIntrinsic(post);
    const out: Point[] = [{ atMinutes: 0, value: intrinsic.value }];
    const sorted = [...post.snapshots].sort((a, b) => a.atMinutes - b.atMinutes);
    for (let i = 0; i < sorted.length; i++) {
      const slice: Post = { ...post, snapshots: sorted.slice(0, i + 1) };
      const live = scoreLive(slice);
      if (live)
        out.push({ atMinutes: sorted[i].atMinutes, value: live.value });
    }
    return out;
  }, [post]);

  if (points.length < 2) {
    return (
      <div className="border-[1.5px] border-dashed border-ink/30 p-6 font-mono text-[10px] uppercase tracking-widest text-ink/50 text-center">
        Add at least one engagement snapshot to see how the score evolves.
      </div>
    );
  }

  const maxX = Math.max(...points.map((p) => p.atMinutes), 60);
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const x = (m: number) => PAD_X + (m / maxX) * innerW;
  const y = (v: number) => PAD_Y + innerH - (v / 100) * innerH;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.atMinutes).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const area =
    `M ${x(points[0].atMinutes).toFixed(1)} ${y(0).toFixed(1)} ` +
    points
      .map((p) => `L ${x(p.atMinutes).toFixed(1)} ${y(p.value).toFixed(1)}`)
      .join(" ") +
    ` L ${x(points[points.length - 1].atMinutes).toFixed(1)} ${y(0).toFixed(1)} Z`;

  return (
    <div className="border-[1.5px] border-ink bg-paper">
      <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
          Score over time
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
          0 → {maxX} min
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-32"
        preserveAspectRatio="none"
        aria-hidden
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <line
            key={v}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(v)}
            y2={y(v)}
            stroke="#0a0a0a18"
            strokeWidth={1}
          />
        ))}
        <path d={area} fill="#ff5c1a22" />
        <path d={path} stroke="#0a0a0a" strokeWidth={2} fill="none" />
        {points.map((p) => (
          <g key={p.atMinutes}>
            <rect
              x={x(p.atMinutes) - 3}
              y={y(p.value) - 3}
              width={6}
              height={6}
              fill="#ff5c1a"
              stroke="#0a0a0a"
              strokeWidth={1.5}
            />
          </g>
        ))}
        <text
          x={PAD_X}
          y={H - 2}
          fontFamily="ui-monospace, Menlo, monospace"
          fontSize="8"
          fill="#0a0a0a99"
        >
          T+0
        </text>
        <text
          x={W - PAD_X}
          y={H - 2}
          textAnchor="end"
          fontFamily="ui-monospace, Menlo, monospace"
          fontSize="8"
          fill="#0a0a0a99"
        >
          T+{maxX}m
        </text>
      </svg>
    </div>
  );
}
