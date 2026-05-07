"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BarChart3, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PlatformIcon } from "@/components/posts/PlatformIcon";
import { EmptyState } from "@/components/EmptyState";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { Platform, PLATFORMS, Post } from "@/lib/types";
import {
  describeBand,
  recommend,
  scoreIntrinsic,
  scoreLive,
} from "@/lib/virality";

export default function InsightsPage() {
  const hydrated = useHydrated();
  const posts = useStore((s) => s.posts);

  const summary = useMemo(() => buildSummary(posts), [posts]);

  if (!hydrated) return null;

  if (posts.length === 0) {
    return (
      <>
        <PageHeader
          kicker="Posts"
          title={
            <span className="flex items-center gap-2">
              <BarChart3 size={14} /> Insights
            </span>
          }
        />
        <div className="p-8">
          <EmptyState
            title="No posts to benchmark yet"
            hint="Create a few posts and the insights page will benchmark them by platform, time of day, and which factors most often drag scores down."
            icon={<BarChart3 size={28} />}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker="Posts"
        title={
          <span className="flex items-center gap-2">
            <BarChart3 size={14} /> Insights ·{" "}
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              {posts.length} posts
            </span>
          </span>
        }
      />
      <div className="p-4 grid grid-cols-12 gap-4">
        <section className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Average score" value={summary.avgScore.toFixed(1)} />
          <KPI label="Best score" value={summary.bestScore.toFixed(1)} />
          <KPI
            label="Hot+ posts"
            value={`${summary.hotCount} / ${posts.length}`}
          />
          <KPI label="Live posts" value={String(summary.liveCount)} />
        </section>

        <section className="col-span-12 lg:col-span-7 border-[1.5px] border-ink bg-paper">
          <Header>Score by platform</Header>
          <ul>
            {summary.byPlatform.map((p) => (
              <li
                key={p.platform}
                className="grid grid-cols-[28px_120px_1fr_auto] items-center gap-3 px-3 h-9 border-b-[1.5px] border-ink/10 last:border-b-0"
              >
                <PlatformIcon platform={p.platform} size={20} />
                <span className="font-mono text-[11px] uppercase tracking-widest">
                  {p.label}
                </span>
                <Bar value={p.avg} max={100} />
                <span className="font-mono text-[11px] tabular-nums w-20 text-right">
                  {p.avg.toFixed(1)} · n={p.count}
                </span>
              </li>
            ))}
            {summary.byPlatform.length === 0 && (
              <li className="px-3 py-6 text-xs text-ink/50 font-mono uppercase tracking-widest text-center">
                No platforms covered yet
              </li>
            )}
          </ul>
        </section>

        <section className="col-span-12 lg:col-span-5 border-[1.5px] border-ink bg-paper">
          <Header>Posting-hour heatmap</Header>
          <div className="p-3">
            <HourHeatmap data={summary.heatmap} />
          </div>
        </section>

        <section className="col-span-12 lg:col-span-7 border-[1.5px] border-ink bg-paper">
          <Header>Factor leaderboard · what drags scores down</Header>
          <ul>
            {summary.factorWeakness.map((f) => (
              <li
                key={f.id}
                className="grid grid-cols-[1fr_auto_120px] items-center gap-3 px-3 h-9 border-b-[1.5px] border-ink/10 last:border-b-0"
              >
                <span className="text-sm">
                  {f.label}
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-ink/40">
                    appears in {f.count} posts
                  </span>
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  avg quality {(f.avgQuality * 100).toFixed(0)}%
                </span>
                <Bar value={1 - f.avgQuality} max={1} tone="#dc2626" />
              </li>
            ))}
          </ul>
        </section>

        <section className="col-span-12 lg:col-span-5 border-[1.5px] border-ink bg-paper">
          <Header>Recommendations roll-up</Header>
          <ul>
            {summary.topRecommendations.map((r) => (
              <li
                key={r.factorId}
                className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 h-9 border-b-[1.5px] border-ink/10 last:border-b-0"
              >
                <span className="text-sm">{r.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                  {r.count} posts · +{r.gainTotal.toFixed(1)} pts
                </span>
              </li>
            ))}
            {summary.topRecommendations.length === 0 && (
              <li className="px-3 py-6 text-xs text-ink/50 font-mono uppercase tracking-widest text-center">
                Nothing left to suggest
              </li>
            )}
          </ul>
        </section>

        <section className="col-span-12 lg:col-span-6 border-[1.5px] border-ink bg-paper">
          <Header>
            <ArrowUpRight size={12} className="inline-block mr-1.5" />
            Top performers
          </Header>
          <PostList items={summary.topPerformers} />
        </section>

        <section className="col-span-12 lg:col-span-6 border-[1.5px] border-ink bg-paper">
          <Header>
            <ArrowDownRight size={12} className="inline-block mr-1.5" />
            Most at-risk
          </Header>
          <PostList items={summary.bottomPerformers} />
        </section>
      </div>
    </>
  );
}

interface ScoredPost {
  post: Post;
  value: number;
  band: ReturnType<typeof describeBand>;
}

interface Summary {
  avgScore: number;
  bestScore: number;
  hotCount: number;
  liveCount: number;
  byPlatform: { platform: Platform; label: string; avg: number; count: number }[];
  heatmap: number[][]; // [day 0-6][hour 0-23] = avg score
  factorWeakness: { id: string; label: string; avgQuality: number; count: number }[];
  topRecommendations: { factorId: string; label: string; count: number; gainTotal: number }[];
  topPerformers: ScoredPost[];
  bottomPerformers: ScoredPost[];
}

function buildSummary(posts: Post[]): Summary {
  const scored: ScoredPost[] = posts.map((p) => {
    const live = scoreLive(p);
    const intrinsic = scoreIntrinsic(p);
    const score = live ?? intrinsic;
    return { post: p, value: score.value, band: describeBand(score.band) };
  });

  const avgScore =
    scored.reduce((s, x) => s + x.value, 0) / Math.max(scored.length, 1);
  const bestScore = scored.reduce((m, x) => Math.max(m, x.value), 0);
  const hotCount = scored.filter(
    (x) => x.band.label === "Hot" || x.band.label === "Rocket",
  ).length;
  const liveCount = posts.filter(
    (p) => p.status === "live" || p.status === "analyzing",
  ).length;

  const byPlatformMap = new Map<Platform, { sum: number; count: number }>();
  for (const s of scored) {
    const e = byPlatformMap.get(s.post.platform) ?? { sum: 0, count: 0 };
    e.sum += s.value;
    e.count += 1;
    byPlatformMap.set(s.post.platform, e);
  }
  const byPlatform = Array.from(byPlatformMap.entries())
    .map(([platform, { sum, count }]) => ({
      platform,
      label: PLATFORMS.find((p) => p.id === platform)?.label ?? platform,
      avg: sum / count,
      count,
    }))
    .sort((a, b) => b.avg - a.avg);

  // Heatmap: 7 days × 24 hours, average score across posts in each cell.
  const heatmap: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => -1),
  );
  const counts: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  for (const s of scored) {
    const d = s.post.context.dayOfWeek;
    const h = s.post.context.postingHour;
    if (heatmap[d][h] < 0) heatmap[d][h] = 0;
    heatmap[d][h] += s.value;
    counts[d][h] += 1;
  }
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (counts[d][h] > 0) heatmap[d][h] /= counts[d][h];
    }
  }

  // Factor weakness: collect each post's intrinsic factors, average the raw
  // quality, weight by the average weight (so a 30%-weight factor dragging
  // down 0.4 quality matters more than a 2%-weight one).
  const facMap = new Map<
    string,
    { label: string; rawSum: number; count: number }
  >();
  for (const p of posts) {
    for (const f of scoreIntrinsic(p).factors) {
      const e = facMap.get(f.id) ?? { label: f.label, rawSum: 0, count: 0 };
      e.rawSum += f.raw;
      e.count += 1;
      facMap.set(f.id, e);
    }
  }
  const factorWeakness = Array.from(facMap.entries())
    .map(([id, { label, rawSum, count }]) => ({
      id,
      label,
      avgQuality: rawSum / count,
      count,
    }))
    .sort((a, b) => a.avgQuality - b.avgQuality)
    .slice(0, 6);

  // Roll up recommendations across all posts.
  const recMap = new Map<
    string,
    { label: string; count: number; gainTotal: number }
  >();
  for (const p of posts) {
    for (const r of recommend(p, 6)) {
      const e = recMap.get(r.factorId) ?? {
        label: r.label,
        count: 0,
        gainTotal: 0,
      };
      e.count += 1;
      e.gainTotal += r.potentialGain;
      recMap.set(r.factorId, e);
    }
  }
  const topRecommendations = Array.from(recMap.entries())
    .map(([factorId, e]) => ({ factorId, ...e }))
    .sort((a, b) => b.gainTotal - a.gainTotal)
    .slice(0, 6);

  const sortedByScore = [...scored].sort((a, b) => b.value - a.value);
  const topPerformers = sortedByScore.slice(0, 5);
  const bottomPerformers = sortedByScore.slice(-5).reverse();

  return {
    avgScore,
    bestScore,
    hotCount,
    liveCount,
    byPlatform,
    heatmap,
    factorWeakness,
    topRecommendations,
    topPerformers,
    bottomPerformers,
  };
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-[1.5px] border-ink bg-paper p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold tabular-nums leading-none">
        {value}
      </div>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
      {children}
    </div>
  );
}

function Bar({
  value,
  max,
  tone = "#0a0a0a",
}: {
  value: number;
  max: number;
  tone?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2 border-[1.5px] border-ink relative">
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${pct}%`,
          backgroundColor: tone === "#0a0a0a" ? "var(--ink-hex)" : tone,
          transition: "width 400ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      />
    </div>
  );
}

function PostList({ items }: { items: ScoredPost[] }) {
  if (items.length === 0) {
    return (
      <div className="px-3 py-6 text-xs text-ink/50 font-mono uppercase tracking-widest text-center">
        No data
      </div>
    );
  }
  return (
    <ul>
      {items.map(({ post, value, band }) => (
        <li
          key={post.id}
          className="grid grid-cols-[28px_auto_1fr_auto] items-center gap-3 px-3 h-9 border-b-[1.5px] border-ink/10 last:border-b-0"
        >
          <PlatformIcon platform={post.platform} size={20} />
          <span
            className="inline-flex items-center justify-center w-10 h-6 border-[1.5px] border-ink font-mono text-xs font-bold tabular-nums"
            style={{ backgroundColor: band.tone }}
          >
            {value.toFixed(0)}
          </span>
          <Link
            href={`/posts/${post.id}`}
            className="truncate text-sm hover:underline"
          >
            {post.title || "Untitled"}
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
            {band.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function HourHeatmap({ data }: { data: number[][] }) {
  // Find min/max for normalization (skip -1 sentinels).
  let min = Infinity;
  let max = -Infinity;
  for (const row of data) {
    for (const v of row) {
      if (v < 0) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const range = max - min || 1;
  return (
    <div>
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: "32px repeat(24, minmax(0, 1fr))" }}
      >
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            className="font-mono text-[8px] uppercase tracking-widest text-ink/40 text-center"
          >
            {h % 3 === 0 ? h : ""}
          </div>
        ))}
        {DAYS.map((d, i) => (
          <Row
            key={d}
            label={d}
            row={data[i]}
            min={min === Infinity ? 0 : min}
            range={range}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-ink/50">
        <span>Empty cells = no posts at that hour/day.</span>
        <span className="flex items-center gap-1">
          low
          <span className="inline-block w-3 h-3 border-[1.5px] border-ink bg-paper-warm" />
          <span className="inline-block w-3 h-3 border-[1.5px] border-ink bg-accent" />
          high
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  row,
  min,
  range,
}: {
  label: string;
  row: number[];
  min: number;
  range: number;
}) {
  return (
    <>
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink/60 flex items-center justify-end pr-1">
        {label}
      </div>
      {row.map((v, h) => {
        const has = v >= 0;
        const t = has ? (v - min) / range : 0;
        return (
          <div
            key={h}
            title={has ? `${label} ${h}:00 — ${v.toFixed(1)}` : `${label} ${h}:00 — no posts`}
            className="h-5 border-[1.5px] border-ink"
            style={{
              backgroundColor: has
                ? `rgb(255 92 26 / ${0.15 + t * 0.85})`
                : "var(--paper-soft-hex)",
            }}
          />
        );
      })}
    </>
  );
}

