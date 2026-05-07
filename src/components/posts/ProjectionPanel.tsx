"use client";

import { Target } from "lucide-react";
import { Post, ViralityThreshold } from "@/lib/types";
import { Input, Label } from "@/components/ui/Input";
import { projectThreshold } from "@/lib/virality";

const METRICS: ViralityThreshold["metric"][] = [
  "views",
  "shares",
  "engagement_rate",
];

const WINDOWS: ViralityThreshold["window"][] = ["24h", "7d", "30d"];

export function ProjectionPanel({
  post,
  onChangeThreshold,
}: {
  post: Post;
  onChangeThreshold: (t: ViralityThreshold) => void;
}) {
  const projection = projectThreshold(post);
  const t = post.threshold;

  return (
    <div className="border-[1.5px] border-ink bg-paper">
      <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
        <Target size={12} className="mr-1.5" /> Viral threshold
      </div>
      <div className="p-3 grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <Label>Metric</Label>
          <select
            value={t.metric}
            onChange={(e) =>
              onChangeThreshold({
                ...t,
                metric: e.target.value as ViralityThreshold["metric"],
              })
            }
            className="w-full h-8 px-2 border-[1.5px] border-ink bg-paper font-mono text-[11px] uppercase tracking-wider"
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {m.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-1">
          <Label>Target</Label>
          <Input
            type="number"
            min={0}
            value={t.value}
            onChange={(e) =>
              onChangeThreshold({
                ...t,
                value: Number(e.target.value) || 0,
              })
            }
            className="h-8 text-xs"
          />
        </div>
        <div className="col-span-1">
          <Label>Window</Label>
          <select
            value={t.window}
            onChange={(e) =>
              onChangeThreshold({
                ...t,
                window: e.target.value as ViralityThreshold["window"],
              })
            }
            className="w-full h-8 px-2 border-[1.5px] border-ink bg-paper font-mono text-[11px] uppercase tracking-wider"
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      </div>
      {projection ? (
        <div className="border-t-[1.5px] border-ink/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              Projected
            </div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-ink/50">
              from {projection.basisMinutes}m of data
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Stat
              label="Hit"
              value={`${(projection.probability * 100).toFixed(0)}%`}
              tone={
                projection.probability >= 0.7
                  ? "#c4f000"
                  : projection.probability >= 0.4
                    ? "#ff5c1a"
                    : "#dc2626"
              }
            />
            <Stat
              label="Forecast"
              value={fmt(projection.projected)}
              tone="var(--paper-soft-hex)"
            />
          </div>
          <Progress
            ratio={Math.min(2, projection.projected / Math.max(t.value, 1))}
          />
        </div>
      ) : (
        <div className="border-t-[1.5px] border-ink/10 p-3 font-mono text-[10px] uppercase tracking-widest text-ink/50">
          Add at least one engagement snapshot to project virality.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      className="border-[1.5px] border-ink p-2"
      style={{ backgroundColor: tone }}
    >
      <div className="font-mono text-[9px] uppercase tracking-widest text-ink/60">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums leading-none">{value}</div>
    </div>
  );
}

function Progress({ ratio }: { ratio: number }) {
  const pct = Math.min(100, ratio * 100);
  const beyond = ratio > 1;
  return (
    <div className="relative h-3 border-[1.5px] border-ink bg-paper-warm">
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${pct}%`,
          backgroundColor: beyond ? "#c4f000" : "var(--ink-hex)",
          transition: "width 400ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      />
      <div
        className="absolute inset-y-0"
        style={{ left: `${Math.min(100, 100 / Math.max(ratio, 1)) * Math.min(1, ratio)}%` }}
      />
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(n < 1 ? 3 : 0);
}
