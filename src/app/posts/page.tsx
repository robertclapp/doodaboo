"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Columns2,
  FlaskConical,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { PageHeader, Tab } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/EmptyState";
import { PlatformIcon } from "@/components/posts/PlatformIcon";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { Platform, PLATFORMS, Post, PostStatus } from "@/lib/types";
import { describeBand, scoreIntrinsic, scoreLive } from "@/lib/virality";
import { timeAgo } from "@/lib/utils";

const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  live: "Live",
  analyzing: "Analyzing",
  archived: "Archived",
};

type FilterTab = "all" | "draft" | "scheduled" | "live" | "archived";

export default function PostsPage() {
  const hydrated = useHydrated();
  const posts = useStore((s) => s.posts);
  const projects = useStore((s) => s.projects);

  const [tab, setTab] = useState<FilterTab>("all");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const out: Record<FilterTab, number> = {
      all: posts.length,
      draft: 0,
      scheduled: 0,
      live: 0,
      archived: 0,
    };
    for (const p of posts) {
      const s = p.status === "analyzing" ? "live" : p.status;
      out[s as FilterTab] = (out[s as FilterTab] ?? 0) + 1;
    }
    return out;
  }, [posts]);

  const filtered = useMemo(() => {
    return posts
      .filter((p) =>
        tab === "all"
          ? true
          : tab === "live"
            ? p.status === "live" || p.status === "analyzing"
            : p.status === tab,
      )
      .filter((p) => platform === "all" || p.platform === platform)
      .filter((p) =>
        !q.trim()
          ? true
          : `${p.title} ${p.content.hook} ${p.content.caption}`
              .toLowerCase()
              .includes(q.toLowerCase()),
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [posts, tab, platform, q]);

  if (!hydrated) return null;

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={14} /> Posts
          </span>
        }
        trailing={
          <>
            <Link href="/posts/lab" className="hidden md:block">
              <Button variant="ghost" size="sm" iconLeft={<FlaskConical size={12} />}>
                Hook Lab
              </Button>
            </Link>
            <Link href="/playbooks" className="hidden md:block">
              <Button variant="ghost" size="sm" iconLeft={<BookOpen size={12} />}>
                Playbooks
              </Button>
            </Link>
            <Link href="/posts/insights" className="hidden md:block">
              <Button variant="ghost" size="sm" iconLeft={<BarChart3 size={12} />}>
                Insights
              </Button>
            </Link>
            <Link href="/posts/compare" className="hidden md:block">
              <Button variant="ghost" size="sm" iconLeft={<Columns2 size={12} />}>
                Compare
              </Button>
            </Link>
            <Link href="/posts/new">
              <Button variant="accent" iconLeft={<Plus size={12} />}>
                New post
              </Button>
            </Link>
          </>
        }
        tabs={
          <>
            <Tab active={tab === "all"} onClick={() => setTab("all")} count={counts.all}>
              All
            </Tab>
            <Tab active={tab === "draft"} onClick={() => setTab("draft")} count={counts.draft}>
              Drafts
            </Tab>
            <Tab active={tab === "scheduled"} onClick={() => setTab("scheduled")} count={counts.scheduled}>
              Scheduled
            </Tab>
            <Tab active={tab === "live"} onClick={() => setTab("live")} count={counts.live}>
              Live
            </Tab>
            <Tab active={tab === "archived"} onClick={() => setTab("archived")} count={counts.archived}>
              Archived
            </Tab>
            <div className="ml-auto flex items-center gap-1">
              <select
                value={platform}
                onChange={(e) =>
                  setPlatform(e.target.value as Platform | "all")
                }
                className="h-7 px-2 border-[1.5px] border-ink bg-paper font-mono text-[10px] uppercase tracking-wider"
              >
                <option value="all">All platforms</option>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <div className="relative ml-1">
                <Search
                  size={11}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-ink/50"
                />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter…"
                  className="h-7 pl-6 w-40 text-xs"
                />
              </div>
            </div>
          </>
        }
      />

      {filtered.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No posts yet"
            hint="Draft a post and the predictor will score it before you publish."
            icon={<Sparkles size={28} />}
            action={
              <Link href="/posts/new">
                <Button variant="accent" iconLeft={<Plus size={12} />}>
                  Create your first post
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col">
          {filtered.map((p) => (
            <PostRow
              key={p.id}
              post={p}
              projectName={
                p.projectId
                  ? projects.find((x) => x.id === p.projectId)?.name
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}

function PostRow({
  post,
  projectName,
}: {
  post: Post;
  projectName?: string;
}) {
  const live = scoreLive(post);
  const score = live ?? scoreIntrinsic(post);
  const tone = describeBand(score.band).tone;
  return (
    <Link
      href={`/posts/${post.id}`}
      className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-3 px-4 h-14 border-b-[1.5px] border-ink/10 hover:bg-ink/[0.03] transition-colors"
    >
      <PlatformIcon platform={post.platform} size={28} />
      <ScorePill value={score.value} tone={tone} />
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{post.title}</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 truncate">
          {STATUS_LABEL[post.status]}
          {projectName && ` · ${projectName}`}
          {post.snapshots.length > 0 &&
            ` · ${post.snapshots.length} snapshots`}
        </div>
      </div>
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50 hidden md:inline">
        {post.content.format}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
        {describeBand(score.band).label}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
        {timeAgo(post.updatedAt)} ago
      </span>
    </Link>
  );
}

function ScorePill({ value, tone }: { value: number; tone: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-12 h-9 border-[1.5px] border-ink font-mono text-sm font-bold tabular-nums"
      style={{ backgroundColor: tone }}
    >
      {value.toFixed(0)}
    </span>
  );
}
