"use client";

import { useMemo, useState } from "react";
import { PageHeader, Tab } from "@/components/PageHeader";
import { TaskList } from "@/components/TaskList";
import { useStore } from "@/lib/store";

export default function MyIssuesPage() {
  const tasks = useStore((s) => s.tasks);
  const currentUserId = useStore((s) => s.currentUserId);
  const hydrated = useStore((s) => s.hydrated);

  const [tab, setTab] = useState<"active" | "backlog" | "done" | "all">("active");
  const [group, setGroup] = useState<
    "status" | "priority" | "project" | "none"
  >("status");

  const mine = useMemo(
    () => tasks.filter((t) => t.assigneeId === currentUserId),
    [tasks, currentUserId],
  );
  const filtered = useMemo(() => {
    switch (tab) {
      case "active":
        return mine.filter(
          (t) =>
            t.status === "in_progress" ||
            t.status === "in_review" ||
            t.status === "todo",
        );
      case "backlog":
        return mine.filter((t) => t.status === "backlog");
      case "done":
        return mine.filter(
          (t) => t.status === "done" || t.status === "cancelled",
        );
      default:
        return mine;
    }
  }, [mine, tab]);

  if (!hydrated) return null;

  return (
    <>
      <PageHeader
        kicker="Personal"
        title="My Issues"
        tabs={
          <>
            <Tab active={tab === "active"} onClick={() => setTab("active")} count={mine.filter((t) => ["todo","in_progress","in_review"].includes(t.status)).length}>
              Active
            </Tab>
            <Tab active={tab === "backlog"} onClick={() => setTab("backlog")} count={mine.filter((t) => t.status === "backlog").length}>
              Backlog
            </Tab>
            <Tab active={tab === "done"} onClick={() => setTab("done")} count={mine.filter((t) => ["done","cancelled"].includes(t.status)).length}>
              Done
            </Tab>
            <Tab active={tab === "all"} onClick={() => setTab("all")} count={mine.length}>
              All
            </Tab>
            <div className="ml-auto flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                Group
              </span>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value as typeof group)}
                className="h-7 px-2 border-[1.5px] border-ink bg-paper font-mono text-[10px] uppercase tracking-wider"
              >
                <option value="status">Status</option>
                <option value="priority">Priority</option>
                <option value="project">Project</option>
                <option value="none">None</option>
              </select>
            </div>
          </>
        }
      />
      <TaskList tasks={filtered} groupBy={group} showProject />
    </>
  );
}
