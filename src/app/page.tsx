"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatusIcon } from "@/components/StatusIcon";
import { PriorityIcon } from "@/components/PriorityIcon";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { STATUSES } from "@/lib/types";
import { formatDateShort, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Plus } from "lucide-react";

export default function HomePage() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const users = useStore((s) => s.users);
  const currentUser = useStore((s) =>
    s.users.find((u) => u.id === s.currentUserId),
  );
  const hydrated = useStore((s) => s.hydrated);

  if (!hydrated) return <Skeleton />;

  const open = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  );
  const mine = open.filter((t) => t.assigneeId === currentUser?.id);

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
              Your open issues · {mine.length}
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
