"use client";

import Link from "next/link";
import { Project, Status, STATUSES, Task } from "@/lib/types";
import { useStore } from "@/lib/store";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { AssigneePicker } from "./pickers/AssigneePicker";
import { StatusPicker } from "./pickers/StatusPicker";
import { PriorityPicker } from "./pickers/PriorityPicker";
import { LabelPicker } from "./pickers/LabelPicker";
import { cn, formatDateShort, priorityRank } from "@/lib/utils";
import { useMemo } from "react";

export function TaskList({
  tasks,
  groupBy = "status",
  showProject = false,
}: {
  tasks: Task[];
  groupBy?: "status" | "priority" | "project" | "none";
  showProject?: boolean;
}) {
  const projects = useStore((s) => s.projects);
  const projById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  if (groupBy === "none") {
    return (
      <TaskListInner tasks={tasks} showProject={showProject} projById={projById} />
    );
  }

  const groups: { key: string; label: string; tasks: Task[] }[] = [];

  if (groupBy === "status") {
    for (const s of STATUSES) {
      const ts = tasks.filter((t) => t.status === s.id);
      if (ts.length === 0) continue;
      groups.push({ key: s.id, label: s.label, tasks: ts });
    }
  } else if (groupBy === "priority") {
    const byP = [...tasks].sort(
      (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
    );
    const seen = new Set<string>();
    for (const t of byP) {
      if (seen.has(t.priority)) continue;
      seen.add(t.priority);
      const ts = byP.filter((x) => x.priority === t.priority);
      groups.push({ key: t.priority, label: t.priority, tasks: ts });
    }
  } else if (groupBy === "project") {
    for (const p of projects) {
      const ts = tasks.filter((t) => t.projectId === p.id);
      if (ts.length === 0) continue;
      groups.push({ key: p.id, label: `${p.key} · ${p.name}`, tasks: ts });
    }
  }

  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="sticky top-[84px] z-10 h-8 bg-paper-soft border-y-[1.5px] border-ink px-4 flex items-center gap-2">
            {groupBy === "status" && <StatusIcon status={g.key as Status} />}
            <div className="font-mono text-[10px] uppercase tracking-widest font-bold">
              {g.label}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              · {g.tasks.length}
            </div>
          </div>
          <TaskListInner
            tasks={g.tasks}
            showProject={showProject}
            projById={projById}
            groupBy={groupBy}
          />
        </div>
      ))}
      {groups.length === 0 && (
        <div className="px-4 py-16 text-center text-sm text-ink/50 font-mono uppercase">
          No issues. Press <kbd className="px-1 border-[1.5px] border-ink mx-1">c</kbd> to create one.
        </div>
      )}
    </div>
  );
}

function TaskListInner({
  tasks,
  showProject,
  projById,
  groupBy,
}: {
  tasks: Task[];
  showProject?: boolean;
  projById: Map<string, Project>;
  groupBy?: "status" | "priority" | "project" | "none";
}) {
  const updateTask = useStore((s) => s.updateTask);

  return (
    <ul className="flex flex-col">
      {tasks.map((t) => {
        const proj = projById.get(t.projectId);
        return (
          <li
            key={t.id}
            className="group grid grid-cols-[auto_auto_auto_1fr_auto_auto_auto_auto] items-center gap-2 px-4 h-9 border-b-[1.5px] border-ink/10 hover:bg-ink/[0.03] transition-colors"
          >
            {groupBy !== "priority" && (
              <PriorityPicker
                value={t.priority}
                onChange={(p) => updateTask(t.id, { priority: p })}
                compact
              />
            )}
            {groupBy === "priority" && (
              <span className="w-[22px] flex items-center">
                <PriorityIcon priority={t.priority} />
              </span>
            )}

            <span className="font-mono text-[10px] text-ink/50 tabular-nums">
              {proj?.key}-{t.number}
            </span>

            {groupBy !== "status" && (
              <StatusPicker
                value={t.status}
                onChange={(s) => updateTask(t.id, { status: s })}
                compact
              />
            )}
            {groupBy === "status" && (
              <span className="w-[22px] flex items-center">
                <StatusIcon status={t.status} />
              </span>
            )}

            <Link
              href={`/projects/${t.projectId}/tasks/${t.id}`}
              className="truncate text-sm hover:underline"
            >
              <span
                className={cn(
                  t.type === "issue" && "text-priority-urgent font-mono text-[10px] uppercase pr-1.5",
                )}
              >
                {t.type === "issue" ? "[ISSUE] " : ""}
              </span>
              {t.title}
            </Link>

            <LabelPicker
              values={t.labelIds}
              onChange={(ids) => updateTask(t.id, { labelIds: ids })}
              compact
            />

            {showProject && proj && (
              <Link
                href={`/projects/${proj.id}`}
                className="font-mono text-[10px] uppercase tracking-wider border-[1.5px] border-ink/30 px-1 h-5 inline-flex items-center"
              >
                {proj.key}
              </Link>
            )}
            {!showProject && <span />}

            <span className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
              {formatDateShort(t.updatedAt)}
            </span>

            <AssigneePicker
              value={t.assigneeId}
              onChange={(id) => updateTask(t.id, { assigneeId: id })}
              restrictToProjectId={t.projectId}
              compact
            />
          </li>
        );
      })}
    </ul>
  );
}
