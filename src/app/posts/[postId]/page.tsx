"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Trash2 } from "lucide-react";
import { useConfirm, useToast } from "@/components/ToastProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PostComposer } from "@/components/posts/PostComposer";
import { ScoreGauge } from "@/components/posts/ScoreGauge";
import { FactorTable } from "@/components/posts/FactorTable";
import { ScoreTimeline } from "@/components/posts/ScoreTimeline";
import { SnapshotForm } from "@/components/posts/SnapshotForm";
import { Recommendations } from "@/components/posts/Recommendations";
import { ProjectionPanel } from "@/components/posts/ProjectionPanel";
import { PlaybookPicker } from "@/components/posts/PlaybookPicker";
import { getPlaybook } from "@/lib/playbooks";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { PostStatus } from "@/lib/types";
import { describeBand, recommend, scoreLive } from "@/lib/virality";
import {
  formatDateShort,
  isoToLocalDateInput,
  localDateInputToIso,
  timeAgo,
} from "@/lib/utils";

const STATUSES: PostStatus[] = ["draft", "scheduled", "live", "analyzing", "archived"];

export default function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const router = useRouter();
  const post = useStore((s) => s.posts.find((p) => p.id === postId));
  const updatePost = useStore((s) => s.updatePost);
  const deletePost = useStore((s) => s.deletePost);
  const duplicatePost = useStore((s) => s.duplicatePost);
  const addSnapshot = useStore((s) => s.addSnapshot);
  const removeSnapshot = useStore((s) => s.removeSnapshot);
  const hydrated = useHydrated();
  const confirm = useConfirm();
  const toast = useToast();

  const live = useMemo(() => (post ? scoreLive(post) : undefined), [post]);
  const recommendations = useMemo(() => (post ? recommend(post) : []), [post]);

  // Auto-save indicator: flashes "saved" when updatedAt changes.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const lastSeenUpdate = useRef<string | undefined>(post?.updatedAt);
  useEffect(() => {
    if (!post) return;
    if (lastSeenUpdate.current && lastSeenUpdate.current !== post.updatedAt) {
      setSavedAt(Date.now());
    }
    lastSeenUpdate.current = post.updatedAt;
  }, [post]);
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 1600);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (!hydrated) return null;
  if (!post) {
    return (
      <div className="p-8 font-mono uppercase text-sm">
        Post not found.{" "}
        <Link href="/posts" className="underline">
          Back to posts
        </Link>
      </div>
    );
  }

  const sortedSnaps = [...post.snapshots].sort(
    (a, b) => a.atMinutes - b.atMinutes,
  );

  return (
    <>
      <PageHeader
        kicker={
          <Link
            href="/posts"
            className="flex items-center gap-1 hover:text-ink"
          >
            <ArrowLeft size={11} /> Posts
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/40">
              {post.platform.replace("_", " ")}
            </span>
            <span className="truncate">{post.title || "Untitled post"}</span>
          </span>
        }
        trailing={
          <>
            <SaveIndicator at={savedAt} />
            <PlaybookPicker
              post={post}
              onApply={({ content, context, playbookId }) =>
                updatePost(post.id, { content, context, playbookId })
              }
            />
            <select
              value={post.status}
              onChange={(e) =>
                updatePost(post.id, {
                  status: e.target.value as PostStatus,
                })
              }
              className="h-7 px-2 border-[1.5px] border-ink bg-paper font-mono text-[10px] uppercase tracking-wider"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Copy size={12} />}
              onClick={() => {
                const v = duplicatePost(post.id);
                if (v) router.push(`/posts/${v.id}`);
              }}
            >
              A/B variant
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Trash2 size={12} />}
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete post",
                  message: "Snapshots and score history will be lost.",
                  confirmLabel: "Delete post",
                  destructive: true,
                });
                if (ok) {
                  deletePost(post.id);
                  toast.success("Post deleted");
                  router.push("/posts");
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />

      {post.status === "scheduled" && (
        <SchedulePicker
          value={post.scheduledAt}
          onChange={(iso) => updatePost(post.id, { scheduledAt: iso })}
        />
      )}

      <PostComposer
        draft={post}
        onChange={(patch) => updatePost(post.id, patch)}
        liveBanner={
          live && (
            <ScoreGauge
              score={live}
              label="Live blended score"
              sublabel={`Updated from ${post.snapshots.length} snapshot${post.snapshots.length === 1 ? "" : "s"}`}
            />
          )
        }
        rightSlot={
          <>
            <Recommendations items={recommendations} />
            {live && <FactorTable factors={live.factors} />}
          </>
        }
      />

      <section className="border-t-[1.5px] border-ink px-5 py-5 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7 space-y-4">
          <ScoreTimeline post={post} />
          <SnapshotForm
            onAdd={(s) => addSnapshot(post.id, s)}
            defaultMinutes={
              sortedSnaps.length === 0
                ? 5
                : Math.min(60, sortedSnaps[sortedSnaps.length - 1].atMinutes + 15)
            }
          />
          <ProjectionPanel
            post={post}
            onChangeThreshold={(threshold) => updatePost(post.id, { threshold })}
          />
        </div>
        <div className="col-span-12 lg:col-span-5">
          <div className="border-[1.5px] border-ink bg-paper">
            <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
              <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
                Snapshots · {sortedSnaps.length}
              </div>
              {live && (
                <div
                  className="font-mono text-[10px] uppercase tracking-widest border-[1.5px] border-ink px-1 h-5 inline-flex items-center"
                  style={{ backgroundColor: describeBand(live.band).tone }}
                >
                  Live {live.value.toFixed(0)}
                </div>
              )}
            </div>
            {sortedSnaps.length === 0 ? (
              <div className="px-3 py-6 font-mono text-[10px] uppercase tracking-widest text-ink/50 text-center">
                No engagement data yet
              </div>
            ) : (
              <ul>
                {sortedSnaps.map((s) => (
                  <li
                    key={s.id}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 h-9 border-b-[1.5px] border-ink/10 last:border-b-0"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-widest font-bold w-16">
                      T+{s.atMinutes}m
                    </span>
                    <span className="font-mono text-[11px] tabular-nums truncate">
                      {fmt(s.views || s.impressions)} views ·{" "}
                      {fmt(s.likes)} likes · {fmt(s.shares)} shares
                      {s.retentionPct != null && ` · ${s.retentionPct}% ret`}
                    </span>
                    <button
                      onClick={() => removeSnapshot(post.id, s.id)}
                      className="font-mono text-[10px] uppercase tracking-widest text-ink/40 hover:text-priority-urgent"
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 border-[1.5px] border-ink bg-paper">
            <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
              Meta
            </div>
            <dl className="text-xs font-mono p-3 space-y-1">
              <Meta label="Created">{formatDateShort(post.createdAt)}</Meta>
              <Meta label="Updated">{timeAgo(post.updatedAt)} ago</Meta>
              {post.scheduledAt && (
                <Meta label="Scheduled">{formatDateShort(post.scheduledAt)}</Meta>
              )}
              {post.postedAt && (
                <Meta label="Posted">{formatDateShort(post.postedAt)}</Meta>
              )}
              <Meta label="Platform">{post.platform.replace("_", " ")}</Meta>
              <Meta label="Format">{post.content.format}</Meta>
              <Meta label="Threshold">
                {fmt(post.threshold.value)} {post.threshold.metric} ·{" "}
                {post.threshold.window}
              </Meta>
              {post.playbookId && (
                <Meta label="Playbook">
                  <Link
                    href={`/playbooks/${post.playbookId}`}
                    className="hover:underline"
                  >
                    {getPlaybook(post.playbookId)?.name ?? post.playbookId}
                  </Link>
                </Meta>
              )}
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink/50 uppercase">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function SaveIndicator({ at }: { at: number | null }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-widest text-ink/50 transition-opacity duration-300"
      style={{ opacity: at ? 1 : 0 }}
      aria-live="polite"
    >
      ● Saved
    </span>
  );
}

function SchedulePicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (iso: string | undefined) => void;
}) {
  const date = isoToLocalDateInput(value);
  const time = value
    ? `${String(new Date(value).getHours()).padStart(2, "0")}:${String(new Date(value).getMinutes()).padStart(2, "0")}`
    : "";

  const update = (nextDate: string, nextTime: string) => {
    if (!nextDate) {
      onChange(undefined);
      return;
    }
    const iso = localDateInputToIso(nextDate);
    if (!iso) return;
    const d = new Date(iso);
    if (nextTime) {
      const [h, m] = nextTime.split(":").map(Number);
      d.setHours(h || 0, m || 0, 0, 0);
    }
    onChange(d.toISOString());
  };

  return (
    <div className="border-b-[1.5px] border-ink bg-paper-soft px-4 py-3 flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
        Scheduled for
      </span>
      <Input
        type="date"
        value={date}
        onChange={(e) => update(e.target.value, time)}
        className="h-7 w-40 text-xs"
      />
      <Input
        type="time"
        value={time}
        onChange={(e) => update(date, e.target.value)}
        className="h-7 w-28 text-xs"
        disabled={!date}
      />
      {value && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink/60">
          → {new Date(value).toLocaleString()}
        </span>
      )}
    </div>
  );
}

