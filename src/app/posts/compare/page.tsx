"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PlatformIcon } from "@/components/posts/PlatformIcon";
import { ScoreGauge } from "@/components/posts/ScoreGauge";
import { Recommendations } from "@/components/posts/Recommendations";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { Post, ScoreFactor } from "@/lib/types";
import { describeBand, recommend, scoreIntrinsic, scoreLive } from "@/lib/virality";

const MAX_LANES = 4;

export default function ComparePage() {
  return (
    <Suspense fallback={null}>
      <ComparePageInner />
    </Suspense>
  );
}

function ComparePageInner() {
  const hydrated = useHydrated();
  const allPosts = useStore((s) => s.posts);
  const params = useSearchParams();
  const router = useRouter();

  const idsParam = params.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_LANES);

  const lanes = useMemo(
    () =>
      ids
        .map((id) => allPosts.find((p) => p.id === id))
        .filter((p): p is Post => Boolean(p)),
    [ids, allPosts],
  );

  const replaceIds = (next: string[]) => {
    const q = next.length ? `?ids=${next.join(",")}` : "";
    router.replace(`/posts/compare${q}`);
  };

  const removeLane = (id: string) =>
    replaceIds(lanes.filter((p) => p.id !== id).map((p) => p.id));

  const addLane = (id: string) => {
    if (lanes.some((p) => p.id === id)) return;
    if (lanes.length >= MAX_LANES) return;
    replaceIds([...lanes.map((p) => p.id), id]);
  };

  if (!hydrated) return null;

  // Build a unified factor row list keyed by factor id, ordered by the first
  // lane's intrinsic factor order so the rows line up consistently.
  const scoredLanes = lanes.map((post) => {
    const intrinsic = scoreIntrinsic(post);
    const live = scoreLive(post);
    return { post, intrinsic, live, recs: recommend(post, 3) };
  });

  const factorIds: string[] = (() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const lane of scoredLanes) {
      for (const f of (lane.live ?? lane.intrinsic).factors) {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          order.push(f.id);
        }
      }
    }
    return order;
  })();

  const factorByLane = scoredLanes.map((lane) => {
    const map = new Map<string, ScoreFactor>();
    for (const f of (lane.live ?? lane.intrinsic).factors) map.set(f.id, f);
    return map;
  });

  return (
    <>
      <PageHeader
        kicker={
          <Link href="/posts" className="flex items-center gap-1 hover:text-ink">
            <ArrowLeft size={11} /> Posts
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            Compare ·{" "}
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              {lanes.length} / {MAX_LANES}
            </span>
          </span>
        }
        trailing={<AddLanePicker selectedIds={lanes.map((p) => p.id)} onAdd={addLane} />}
      />

      {lanes.length === 0 ? (
        <div className="p-8">
          <div className="border-[1.5px] border-dashed border-ink/30 bg-paper p-8 text-center">
            <div className="font-mono text-[11px] uppercase tracking-widest text-ink/60">
              Pick posts to compare
            </div>
            <div className="mt-2 text-sm text-ink/60 max-w-md mx-auto">
              Use the picker above to line up two to four posts side by side.
              Their scores, factor breakdowns, and recommendations render in
              parallel so you can see exactly what's driving the difference.
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${lanes.length}, minmax(260px, 1fr))`,
            }}
          >
            {scoredLanes.map((lane) => {
              const score = lane.live ?? lane.intrinsic;
              return (
                <div
                  key={lane.post.id}
                  className="border-[1.5px] border-ink bg-paper flex flex-col"
                >
                  <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center gap-2">
                    <PlatformIcon platform={lane.post.platform} size={18} />
                    <Link
                      href={`/posts/${lane.post.id}`}
                      className="font-mono text-[11px] uppercase tracking-widest font-bold truncate hover:underline"
                    >
                      {lane.post.title || "Untitled"}
                    </Link>
                    <button
                      onClick={() => removeLane(lane.post.id)}
                      className="ml-auto p-1 hover:bg-ink hover:text-paper transition-colors"
                      title="Remove from comparison"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <div className="p-3 space-y-3">
                    <ScoreGauge
                      score={score}
                      label={lane.live ? "Live blended" : "Intrinsic"}
                      sublabel={
                        lane.live
                          ? `${lane.post.snapshots.length} snapshot${lane.post.snapshots.length === 1 ? "" : "s"}`
                          : "Pre-publish"
                      }
                    />
                    <ContentSummary post={lane.post} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-[1.5px] border-ink bg-paper">
            <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
              Factor breakdown
            </div>
            <div
              className="grid gap-0"
              style={{
                gridTemplateColumns: `220px repeat(${lanes.length}, minmax(120px, 1fr))`,
              }}
            >
              <Cell head>Factor</Cell>
              {scoredLanes.map((lane) => (
                <Cell key={lane.post.id} head>
                  {(lane.live ?? lane.intrinsic).value.toFixed(0)} ·{" "}
                  {describeBand((lane.live ?? lane.intrinsic).band).label}
                </Cell>
              ))}
              {factorIds.map((id) => {
                const values = factorByLane.map((m) => m.get(id));
                const max = Math.max(
                  ...values.map((v) => v?.contribution ?? 0),
                );
                return (
                  <FactorRowSplit
                    key={id}
                    id={id}
                    values={values}
                    max={max}
                  />
                );
              })}
            </div>
          </div>

          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${lanes.length}, minmax(260px, 1fr))`,
            }}
          >
            {scoredLanes.map((lane) => (
              <Recommendations key={lane.post.id} items={lane.recs} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Cell({
  children,
  head,
}: {
  children: React.ReactNode;
  head?: boolean;
}) {
  return (
    <div
      className={`px-3 h-9 flex items-center font-mono text-[11px] uppercase tracking-widest border-b-[1.5px] border-ink/10 ${
        head ? "bg-paper-soft font-bold" : ""
      }`}
    >
      {children}
    </div>
  );
}

function FactorRowSplit({
  id,
  values,
  max,
}: {
  id: string;
  values: (ScoreFactor | undefined)[];
  max: number;
}) {
  const label = values.find(Boolean)?.label ?? id;
  return (
    <>
      <Cell>{label}</Cell>
      {values.map((v, idx) => (
        <div
          key={idx}
          className="px-3 h-9 flex items-center gap-2 border-b-[1.5px] border-ink/10"
        >
          <div className="flex-1 h-2 border-[1.5px] border-ink relative">
            {v && (
              <div
                className="absolute inset-y-0 left-0 bg-ink"
                style={{
                  width: `${max > 0 ? (v.contribution / max) * 100 : 0}%`,
                  transition: "width 400ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                }}
              />
            )}
          </div>
          <span className="font-mono text-[11px] tabular-nums w-12 text-right">
            {v ? v.contribution.toFixed(1) : "—"}
          </span>
        </div>
      ))}
    </>
  );
}

function ContentSummary({ post }: { post: Post }) {
  return (
    <dl className="text-xs space-y-1.5">
      <Field label="Hook">{post.content.hook || <em className="text-ink/40">—</em>}</Field>
      <Field label="Caption">
        {post.content.caption ? (
          <span className="text-ink/80">
            {post.content.caption.length > 110
              ? post.content.caption.slice(0, 110) + "…"
              : post.content.caption}
          </span>
        ) : (
          <em className="text-ink/40">—</em>
        )}
      </Field>
      <Field label="Format">{post.content.format}</Field>
      {post.content.durationSec != null && (
        <Field label="Duration">{post.content.durationSec}s</Field>
      )}
      <Field label="Hashtags">
        {post.content.hashtags.length === 0
          ? "—"
          : post.content.hashtags.map((t) => `#${t}`).join(" ")}
      </Field>
      <Field label="Posted at">
        {post.context.postingHour}:00 ·{" "}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
          post.context.dayOfWeek
        ]}
      </Field>
    </dl>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
        {label}
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function AddLanePicker({
  selectedIds,
  onAdd,
}: {
  selectedIds: string[];
  onAdd: (id: string) => void;
}) {
  const posts = useStore((s) => s.posts);
  const remaining = posts.filter((p) => !selectedIds.includes(p.id));
  if (remaining.length === 0 || selectedIds.length >= MAX_LANES) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink/40">
        {selectedIds.length >= MAX_LANES ? "Lane limit reached" : "All posts added"}
      </span>
    );
  }
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value);
      }}
      className="h-7 px-2 border-[1.5px] border-ink bg-paper font-mono text-[10px] uppercase tracking-wider"
    >
      <option value="">+ Add a lane…</option>
      {remaining.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title || "Untitled"} · {p.platform.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}
