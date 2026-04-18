"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatusIcon } from "@/components/StatusIcon";
import { PriorityIcon } from "@/components/PriorityIcon";
import { AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";
import { formatDateShort } from "@/lib/utils";

export default function ProjectsPage() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const users = useStore((s) => s.users);
  const hydrated = useStore((s) => s.hydrated);

  if (!hydrated) return null;

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title={<span>All Projects</span>}
        trailing={
          <Link href="/projects/new">
            <Button variant="accent" iconLeft={<Plus size={12} />}>
              New Project
            </Button>
          </Link>
        }
      />
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((p) => {
          const pTasks = tasks.filter((t) => t.projectId === p.id);
          const done = pTasks.filter((t) => t.status === "done").length;
          const pct =
            pTasks.length > 0 ? Math.round((done / pTasks.length) * 100) : 0;
          const members = p.memberIds
            .map((id) => users.find((u) => u.id === id))
            .filter(Boolean);
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="border-[1.5px] border-ink bg-paper hover:-translate-y-[2px] hover:shadow-brutal transition-all"
            >
              <div className="p-4 border-b-[1.5px] border-ink flex items-start gap-3">
                <div
                  className="w-10 h-10 flex items-center justify-center border-[1.5px] border-ink font-mono text-base font-bold"
                  style={{ backgroundColor: p.accent }}
                >
                  {p.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                    {p.key}
                  </div>
                  <div className="text-lg font-bold leading-tight truncate">
                    {p.name}
                  </div>
                  <div className="text-xs text-ink/60 truncate">
                    {p.description || "—"}
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                    <StatusIcon status={p.status} /> {p.status.replace("_", " ")}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                    <PriorityIcon priority={p.priority} /> {p.priority}
                  </span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink/50">
                    Due {formatDateShort(p.targetDate)}
                  </span>
                </div>
                <div className="h-1.5 border-[1.5px] border-ink bg-paper-warm">
                  <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <AvatarStack users={members} size={20} />
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60">
                    {pTasks.length} issues · {pct}% done
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
        <Link
          href="/projects/new"
          className="border-[1.5px] border-dashed border-ink/40 text-ink/60 hover:border-ink hover:text-ink flex items-center justify-center min-h-[220px] font-mono text-xs uppercase tracking-widest"
        >
          + Create Project
        </Link>
      </div>
    </>
  );
}
