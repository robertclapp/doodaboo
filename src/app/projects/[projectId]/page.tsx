"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader, Tab } from "@/components/PageHeader";
import { AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useStore } from "@/lib/store";
import { TaskList } from "@/components/TaskList";
import { KanbanBoard } from "@/components/KanbanBoard";
import { StatusPicker } from "@/components/pickers/StatusPicker";
import { PriorityPicker } from "@/components/pickers/PriorityPicker";
import { AssigneePicker } from "@/components/pickers/AssigneePicker";
import { Priority, PRIORITIES, Status, STATUSES } from "@/lib/types";
import { formatDateShort } from "@/lib/utils";
import { LayoutGrid, List, Search, Trash2 } from "lucide-react";
import { useConfirm, useToast } from "@/components/ToastProvider";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const tasks = useStore((s) =>
    s.tasks.filter((t) => t.projectId === projectId),
  );
  const users = useStore((s) => s.users);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const restoreProject = useStore((s) => s.restoreProject);
  const hydrated = useStore((s) => s.hydrated);

  const confirm = useConfirm();
  const toast = useToast();

  const [view, setView] = useState<"list" | "board">("list");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterPriority, setFilterPriority] = useState<Priority | "all">("all");
  const [filterAssignee, setFilterAssignee] = useState<string | "all">("all");
  const [filterLabel, setFilterLabel] = useState<string | "all">("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return tasks.filter(
      (t) =>
        (filterStatus === "all" || t.status === filterStatus) &&
        (filterPriority === "all" || t.priority === filterPriority) &&
        (filterAssignee === "all" ||
          (filterAssignee === "" && !t.assigneeId) ||
          t.assigneeId === filterAssignee) &&
        (filterLabel === "all" || t.labelIds.includes(filterLabel)) &&
        (!q.trim() || t.title.toLowerCase().includes(q.toLowerCase())),
    );
  }, [tasks, filterStatus, filterPriority, filterAssignee, filterLabel, q]);

  if (!hydrated) return null;
  if (!project) {
    return (
      <div className="p-8 font-mono uppercase text-sm">
        Project not found.{" "}
        <Link href="/projects" className="underline">
          Back
        </Link>
      </div>
    );
  }

  const members = project.memberIds
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean);
  const done = tasks.filter((t) => t.status === "done").length;
  const pct =
    tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <>
      <PageHeader
        kicker={
          <Link href="/projects" className="hover:text-ink">
            Projects
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            <span
              className="w-5 h-5 flex items-center justify-center border-[1.5px] border-ink font-mono text-[10px] font-bold"
              style={{ backgroundColor: project.accent }}
            >
              {project.icon}
            </span>
            <span>{project.name}</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50 pl-1">
              {project.key}
            </span>
          </span>
        }
        trailing={
          <>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Trash2 size={12} />}
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete project",
                  message: `This will delete "${project.name}" and all its tasks.`,
                  confirmLabel: "Delete project",
                  destructive: true,
                });
                if (ok) {
                  // Snapshot project + cascaded tasks BEFORE the delete so
                  // Undo can restore both with their original IDs intact.
                  const snapshot = {
                    project,
                    tasks: tasks.slice(),
                  };
                  deleteProject(project.id);
                  toast.success(`Deleted ${project.name}`, {
                    action: {
                      label: "Undo",
                      onClick: () => restoreProject(snapshot),
                    },
                  });
                  router.push("/projects");
                }
              }}
            >
              Delete
            </Button>
          </>
        }
        tabs={
          <>
            <Tab active={view === "list"} onClick={() => setView("list")}>
              <List size={12} /> List
            </Tab>
            <Tab active={view === "board"} onClick={() => setView("board")}>
              <LayoutGrid size={12} /> Board
            </Tab>
            <div className="ml-auto flex items-center gap-1">
              <StatusFilter value={filterStatus} onChange={setFilterStatus} />
              <PriorityFilter
                value={filterPriority}
                onChange={setFilterPriority}
              />
              <AssigneeFilter
                value={filterAssignee}
                onChange={setFilterAssignee}
                memberIds={project.memberIds}
              />
              <LabelFilter value={filterLabel} onChange={setFilterLabel} />
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

      <div className="border-b-[1.5px] border-ink bg-paper-soft px-4 py-3 grid grid-cols-[1fr_auto] gap-4 items-center">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              Status
            </span>
            <StatusPicker
              value={project.status}
              onChange={(s) => updateProject(project.id, { status: s })}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              Priority
            </span>
            <PriorityPicker
              value={project.priority}
              onChange={(p) => updateProject(project.id, { priority: p })}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              Lead
            </span>
            <AssigneePicker
              value={project.leadId}
              onChange={(id) => updateProject(project.id, { leadId: id })}
            />
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink/60">
            Due {formatDateShort(project.targetDate)} · {tasks.length} issues ·{" "}
            {pct}% done
          </div>
        </div>
        <AvatarStack users={members} size={22} max={6} />
      </div>

      {project.description && (
        <div className="px-4 py-3 border-b-[1.5px] border-ink/10 text-sm text-ink/80">
          {project.description}
        </div>
      )}

      {view === "list" ? (
        <TaskList tasks={filtered} groupBy="status" />
      ) : (
        <KanbanBoard tasks={filtered} />
      )}
    </>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: Status | "all";
  onChange: (v: Status | "all") => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Status | "all")}
      className="h-7 px-2 border-[1.5px] border-ink bg-paper font-mono text-[10px] uppercase tracking-wider"
    >
      <option value="all">All Status</option>
      {STATUSES.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

function PriorityFilter({
  value,
  onChange,
}: {
  value: Priority | "all";
  onChange: (v: Priority | "all") => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Priority | "all")}
      className="h-7 px-2 border-[1.5px] border-ink bg-paper font-mono text-[10px] uppercase tracking-wider"
    >
      <option value="all">All Priority</option>
      {PRIORITIES.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

function LabelFilter({
  value,
  onChange,
}: {
  value: string | "all";
  onChange: (v: string | "all") => void;
}) {
  const labels = useStore((s) => s.labels);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 px-2 border-[1.5px] border-ink bg-paper font-mono text-[10px] uppercase tracking-wider"
    >
      <option value="all">All Labels</option>
      {labels.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

function AssigneeFilter({
  value,
  onChange,
  memberIds,
}: {
  value: string | "all";
  onChange: (v: string | "all") => void;
  memberIds: string[];
}) {
  const users = useStore((s) =>
    s.users.filter((u) => memberIds.includes(u.id)),
  );
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 px-2 border-[1.5px] border-ink bg-paper font-mono text-[10px] uppercase tracking-wider"
    >
      <option value="all">All Assignees</option>
      <option value="">Unassigned</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          @{u.handle}
        </option>
      ))}
    </select>
  );
}
