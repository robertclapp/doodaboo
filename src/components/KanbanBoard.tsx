"use client";

import Link from "next/link";
import { Status, STATUSES, Task } from "@/lib/types";
import { useStore } from "@/lib/store";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Avatar } from "./ui/Avatar";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function KanbanBoard({ tasks }: { tasks: Task[] }) {
  const projects = useStore((s) => s.projects);
  const users = useStore((s) => s.users);
  const labels = useStore((s) => s.labels);
  const moveTaskStatus = useStore((s) => s.moveTaskStatus);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<Status | null>(null);

  return (
    <div className="flex-1 overflow-x-auto">
      <div className="flex min-w-max p-3 gap-3 items-stretch">
        {STATUSES.map((s) => {
          const col = tasks.filter((t) => t.status === s.id);
          return (
            <div
              key={s.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStatus(s.id);
              }}
              onDragLeave={() => setOverStatus((x) => (x === s.id ? null : x))}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingId) moveTaskStatus(draggingId, s.id);
                setDraggingId(null);
                setOverStatus(null);
              }}
              className={cn(
                "w-[280px] shrink-0 border-[1.5px] border-ink bg-paper flex flex-col",
                overStatus === s.id && "shadow-brutal-sm -translate-x-[1px] -translate-y-[1px]",
              )}
            >
              <div className="h-9 border-b-[1.5px] border-ink px-2 flex items-center gap-2 bg-paper-soft">
                <StatusIcon status={s.id} />
                <div className="font-mono text-[11px] uppercase tracking-wider font-bold">
                  {s.label}
                </div>
                <div className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink/50">
                  {col.length}
                </div>
              </div>
              <div className="flex flex-col gap-2 p-2 min-h-[120px]">
                {col.map((t) => {
                  const proj = projects.find((p) => p.id === t.projectId);
                  const assignee = users.find((u) => u.id === t.assigneeId);
                  const tLabels = labels.filter((l) =>
                    t.labelIds.includes(l.id),
                  );
                  return (
                    <Link
                      href={`/projects/${t.projectId}/tasks/${t.id}`}
                      key={t.id}
                      draggable
                      onDragStart={() => setDraggingId(t.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverStatus(null);
                      }}
                      className={cn(
                        "block border-[1.5px] border-ink bg-paper p-2 hover:-translate-y-[1px] hover:shadow-brutal-sm active:translate-y-[1px] transition-all cursor-grab active:cursor-grabbing",
                        draggingId === t.id && "opacity-50",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <PriorityIcon priority={t.priority} />
                          <span className="font-mono text-[10px] text-ink/50">
                            {proj?.key}-{t.number}
                          </span>
                        </div>
                        <Avatar user={assignee} size={18} />
                      </div>
                      <div className="mt-1.5 text-xs leading-snug line-clamp-3">
                        {t.type === "issue" && (
                          <span className="text-priority-urgent font-mono text-[9px] uppercase pr-1">
                            [ISSUE]
                          </span>
                        )}
                        {t.title}
                      </div>
                      {tLabels.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tLabels.map((l) => (
                            <span
                              key={l.id}
                              className="inline-flex items-center gap-1 border-[1.5px] border-ink h-4 px-1 font-mono text-[9px] uppercase tracking-wider"
                            >
                              <span
                                className="w-1.5 h-1.5"
                                style={{ backgroundColor: l.color }}
                              />
                              {l.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>
                  );
                })}
                {col.length === 0 && (
                  <div className="border-[1.5px] border-dashed border-ink/20 h-16 flex items-center justify-center font-mono text-[10px] uppercase tracking-widest text-ink/40">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
