"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatusIcon } from "@/components/StatusIcon";
import { PriorityIcon } from "@/components/PriorityIcon";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { DueBadge } from "@/components/DueBadge";
import { STATUSES } from "@/lib/types";
import { formatDateShort, timeAgo } from "@/lib/utils";
import { buildMyDay } from "@/lib/myDay";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Crosshair, Plus, Sparkles, X } from "lucide-react";
import { PlatformIcon } from "@/components/posts/PlatformIcon";
import { describeBand, scoreIntrinsic, scoreLive } from "@/lib/virality";

export default function HomePage() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const users = useStore((s) => s.users);
  const posts = useStore((s) => s.posts);
  const currentUser = useStore((s) =>
    s.users.find((u) => u.id === s.currentUserId),
  );
  const hydrated = useStore((s) => s.hydrated);

  // Focus mode is intentionally local-only: it's a "calm the page down right
  // now" affordance, not something the user needs to deep-link to or that
  // should survive a reload. A query-param dance here would be friction.
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  if (!hydrated) return <Skeleton />;

  const open = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  );
  const mine = open.filter((t) => t.assigneeId === currentUser?.id);
  const myDay = buildMyDay(tasks, currentUser?.id);

  const focused = focusedTaskId
    ? tasks.find((t) => t.id === focusedTaskId)
    : null;

  // Focus mode: render ONLY the focused task plus an escape hatch. Hiding
  // workload counters / lists / posts is the whole point — single next
  // action, nothing else competing for attention.
  if (focused) {
    const proj = projects.find((p) => p.id === focused.projectId);
    const assignee = users.find((u) => u.id === focused.assigneeId);
    return (
      <>
        <PageHeader
          kicker="Focus"
          title={<span>One thing at a time</span>}
          trailing={
            <Button
              variant="outline"
              iconLeft={<X size={12} />}
              onClick={() => setFocusedTaskId(null)}
            >
              Show everything
            </Button>
          }
        />
        <div className="p-4">
          <section className="border-[1.5px] border-ink bg-paper">
            <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest font-bold">
                <PriorityIcon priority={focused.priority} />
                <StatusIcon status={focused.status} size={14} />
                <span>
                  {proj?.key}-{focused.number}
                </span>
              </div>
              <DueBadge iso={focused.dueDate} />
            </div>
            <div className="p-6 flex flex-col gap-4">
              <h2 className="text-2xl font-bold leading-tight">
                {focused.title}
              </h2>
              {focused.description && (
                <p className="text-sm text-ink/80 whitespace-pre-wrap leading-relaxed">
                  {focused.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-ink/60">
                {proj && (
                  <Link
                    href={`/projects/${proj.id}`}
                    className="inline-flex items-center gap-1 hover:text-ink"
                  >
                    <span
                      className="w-4 h-4 inline-flex items-center justify-center border-[1.5px] border-ink text-[9px] font-bold"
                      style={{ backgroundColor: proj.accent }}
                    >
                      {proj.icon}
                    </span>
                    {proj.name}
                  </Link>
                )}
                {assignee && (
                  <span className="inline-flex items-center gap-1">
                    <Avatar user={assignee} size={14} />
                    {assignee.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Link href={`/projects/${focused.projectId}/tasks/${focused.id}`}>
                  <Button variant="accent" iconRight={<ArrowRight size={12} />}>
                    Open task
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </>
    );
  }

  const statusCounts = STATUSES.map((s) => ({
    ...s,
    count: tasks.filter((t) => t.status === s.id).length,
  }));

  const recent = [...tasks]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 8);

  return (
    <>
      <PageHeader
        kicker="Home"
        title={<span>Dashboard</span>}
        trailing={
          <Link href="/projects/new">
            <Button variant="accent" iconLeft={<Plus size={12} />}>
              New Project
            </Button>
          </Link>
        }
      />

      <div className="p-4 grid grid-cols-12 gap-4">
        <section
          aria-label="My Day"
          className="col-span-12 border-[1.5px] border-ink bg-paper"
        >
          <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
            <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
              My Day · top {myDay.length} by priority + due
            </div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              {currentUser?.name ?? "—"}
            </span>
          </div>
          <ul>
            {myDay.map((t) => {
              const proj = projects.find((p) => p.id === t.projectId);
              return (
                <li
                  key={t.id}
                  className="grid grid-cols-[auto_auto_auto_1fr_auto_auto] items-center gap-2 px-3 h-10 border-b-[1.5px] border-ink/10 last:border-b-0 hover:bg-ink/[0.03]"
                >
                  <StatusIcon status={t.status} size={14} />
                  <PriorityIcon priority={t.priority} />
                  <span className="font-mono text-[10px] text-ink/50 tabular-nums">
                    {proj?.key}-{t.number}
                  </span>
                  <Link
                    href={`/projects/${t.projectId}/tasks/${t.id}`}
                    className="truncate text-sm hover:underline"
                  >
                    {t.title}
                  </Link>
                  <DueBadge iso={t.dueDate} />
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft={<Crosshair size={11} />}
                    onClick={() => setFocusedTaskId(t.id)}
                    aria-label={`Focus on ${t.title}`}
                    title="Hide everything else and focus on this"
                  >
                    Focus
                  </Button>
                </li>
              );
            })}
            {myDay.length === 0 && (
              <li className="px-3 py-6 text-xs text-ink/50 font-mono uppercase tracking-widest">
                Nothing active for today — pick something from below, or rest.
              </li>
            )}
          </ul>
        </section>

        <section className="col-span-12 border-[1.5px] border-ink bg-paper">
          <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
            <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
              Workload · {currentUser?.name ?? "—"}
            </div>
            <Link
              href="/my-issues"
              className="font-mono text-[10px] uppercase tracking-widest text-ink/50 hover:text-ink flex items-center gap-1"
            >
              My issues <ArrowRight size={10} />
            </Link>
          </div>
          <div className="grid grid-cols-6">
            {statusCounts.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center gap-2 px-3 py-3 ${i > 0 ? "border-l-[1.5px] border-ink/10" : ""}`}
              >
                <StatusIcon status={s.id} size={16} />
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50">
                    {s.label}
                  </div>
                  <div className="text-2xl font-bold tabular-nums leading-none">
                    {s.count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="col-span-12 lg:col-span-7 border-[1.5px] border-ink bg-paper">
          <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
            <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
              All my open issues · {mine.length}
            </div>
          </div>
          <ul>
            {mine.slice(0, 8).map((t) => {
              const proj = projects.find((p) => p.id === t.projectId);
              return (
                <li
                  key={t.id}
                  className="grid grid-cols-[auto_auto_auto_1fr_auto] items-center gap-2 px-3 h-9 border-b-[1.5px] border-ink/10 hover:bg-ink/[0.03]"
                >
                  <PriorityIcon priority={t.priority} />
                  <span className="font-mono text-[10px] text-ink/50 tabular-nums">
                    {proj?.key}-{t.number}
                  </span>
                  <StatusIcon status={t.status} />
                  <Link
                    href={`/projects/${t.projectId}/tasks/${t.id}`}
                    className="truncate text-sm hover:underline"
                  >
                    {t.title}
                  </Link>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
                    {formatDateShort(t.updatedAt)}
                  </span>
                </li>
              );
            })}
            {mine.length === 0 && (
              <li className="px-3 py-6 text-xs text-ink/50 font-mono uppercase tracking-widest">
                No issues assigned to you — glorious.
              </li>
            )}
          </ul>
        </section>

        <section className="col-span-12 lg:col-span-5 border-[1.5px] border-ink bg-paper">
          <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
            <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
              Projects · {projects.length}
            </div>
            <Link
              href="/projects"
              className="font-mono text-[10px] uppercase tracking-widest text-ink/50 hover:text-ink"
            >
              view all
            </Link>
          </div>
          <ul>
            {projects.slice(0, 5).map((p) => {
              const pTasks = tasks.filter((t) => t.projectId === p.id);
              const done = pTasks.filter((t) => t.status === "done").length;
              const pct =
                pTasks.length > 0
                  ? Math.round((done / pTasks.length) * 100)
                  : 0;
              const members = p.memberIds
                .map((id) => users.find((u) => u.id === id))
                .filter(Boolean);
              return (
                <li
                  key={p.id}
                  className="px-3 py-3 border-b-[1.5px] border-ink/10 last:border-b-0"
                >
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-2"
                  >
                    <span
                      className="w-6 h-6 flex items-center justify-center border-[1.5px] border-ink font-mono text-[10px] font-bold"
                      style={{ backgroundColor: p.accent }}
                    >
                      {p.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {p.name}
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
                        {p.key} · {pTasks.length} issues · {pct}% done
                      </div>
                    </div>
                    <AvatarStack users={members} size={18} />
                  </Link>
                  <div className="mt-2 h-1.5 border-[1.5px] border-ink bg-paper-warm">
                    <div
                      className="h-full bg-ink"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="col-span-12 border-[1.5px] border-ink bg-paper">
          <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
            <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
              <Sparkles size={12} className="inline-block mr-1 -translate-y-px" />
              Top posts · virality predictor
            </div>
            <Link
              href="/posts"
              className="font-mono text-[10px] uppercase tracking-widest text-ink/50 hover:text-ink"
            >
              all posts
            </Link>
          </div>
          <ul>
            {posts
              .map((p) => {
                const live = scoreLive(p);
                const score = live ?? scoreIntrinsic(p);
                return { p, score };
              })
              .sort((a, b) => b.score.value - a.score.value)
              .slice(0, 5)
              .map(({ p, score }) => (
                <li
                  key={p.id}
                  className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-2 px-3 h-9 border-b-[1.5px] border-ink/10 last:border-b-0"
                >
                  <PlatformIcon platform={p.platform} size={20} />
                  <span
                    className="inline-flex items-center justify-center w-10 h-6 border-[1.5px] border-ink font-mono text-xs font-bold tabular-nums"
                    style={{ backgroundColor: describeBand(score.band).tone }}
                  >
                    {score.value.toFixed(0)}
                  </span>
                  <Link
                    href={`/posts/${p.id}`}
                    className="truncate text-sm hover:underline"
                  >
                    {p.title || "Untitled post"}
                  </Link>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50 hidden md:inline">
                    {describeBand(score.band).label}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                    {p.snapshots.length > 0
                      ? `${p.snapshots.length} snapshots`
                      : "pre-publish"}
                  </span>
                </li>
              ))}
            {posts.length === 0 && (
              <li className="px-3 py-6 text-xs text-ink/50 font-mono uppercase tracking-widest">
                Draft a post to see virality predictions.
              </li>
            )}
          </ul>
        </section>

        <section className="col-span-12 border-[1.5px] border-ink bg-paper">
          <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center">
            <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
              Recent activity
            </div>
          </div>
          <ul className="divide-y-[1.5px] divide-ink/10">
            {recent.map((t) => {
              const proj = projects.find((p) => p.id === t.projectId);
              const a = users.find((u) => u.id === t.assigneeId);
              return (
                <li
                  key={t.id}
                  className="grid grid-cols-[auto_auto_auto_1fr_auto_auto] items-center gap-2 px-3 h-9 hover:bg-ink/[0.03]"
                >
                  <PriorityIcon priority={t.priority} />
                  <span className="font-mono text-[10px] text-ink/50 tabular-nums">
                    {proj?.key}-{t.number}
                  </span>
                  <StatusIcon status={t.status} />
                  <Link
                    href={`/projects/${t.projectId}/tasks/${t.id}`}
                    className="truncate text-sm hover:underline"
                  >
                    {t.title}
                  </Link>
                  <Avatar user={a} size={16} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
                    {timeAgo(t.updatedAt)} ago
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div className="p-6 font-mono text-xs uppercase tracking-widest text-ink/40 animate-wink">
      Loading…
    </div>
  );
}
