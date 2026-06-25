"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Textarea, Input, Label } from "@/components/ui/Input";
import { StatusPicker } from "@/components/pickers/StatusPicker";
import { PriorityPicker } from "@/components/pickers/PriorityPicker";
import { AssigneePicker } from "@/components/pickers/AssigneePicker";
import { LabelPicker } from "@/components/pickers/LabelPicker";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { Avatar } from "@/components/ui/Avatar";
import {
  formatDateShort,
  isoToLocalDateInput,
  localDateInputToIso,
  timeAgo,
} from "@/lib/utils";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useConfirm, useToast } from "@/components/ToastProvider";

export default function TaskDetailPage() {
  const { projectId, taskId } = useParams<{
    projectId: string;
    taskId: string;
  }>();
  const router = useRouter();

  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const users = useStore((s) => s.users);
  const labels = useStore((s) => s.labels);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const restoreTask = useStore((s) => s.restoreTask);
  const addComment = useStore((s) => s.addComment);
  const hydrated = useHydrated();
  const confirm = useConfirm();
  const toast = useToast();

  // Local draft for the new-comment textarea. (NOT a mirror of an
  // existing task field — comments are submitted on button click.)
  const [comment, setComment] = useState("");

  // Flash-on-save indicator: shows briefly whenever the canonical task
  // updatedAt changes. Mirrors the post detail page's pattern so both
  // editor pages signal "saved" the same way.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const lastSeenUpdate = useRef<string | undefined>(task?.updatedAt);
  useEffect(() => {
    if (!task) return;
    if (lastSeenUpdate.current && lastSeenUpdate.current !== task.updatedAt) {
      setSavedAt(Date.now());
    }
    lastSeenUpdate.current = task.updatedAt;
  }, [task]);
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 1600);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (!hydrated) return null;
  // Guard: the taskId path segment must belong to the project in the URL.
  // Otherwise a link like /projects/<A>/tasks/<task-from-B> would render B's
  // data under A's header/back-link, producing a misleading view and letting
  // edits leak across projects.
  if (!task || !project || task.projectId !== project.id) {
    return (
      <div className="p-8 font-mono uppercase text-sm">
        Not found.{" "}
        <Link href="/" className="underline">
          Home
        </Link>
      </div>
    );
  }

  const assignee = users.find((u) => u.id === task.assigneeId);
  const taskLabels = labels.filter((l) => task.labelIds.includes(l.id));

  return (
    <>
      <PageHeader
        kicker={
          <Link
            href={`/projects/${project.id}`}
            className="flex items-center gap-1 hover:text-ink"
          >
            <ArrowLeft size={11} />
            {project.key}-{task.number}
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            {task.type === "issue" && (
              <span className="font-mono text-[10px] uppercase tracking-widest bg-priority-urgent text-paper border-[1.5px] border-ink px-1 h-5 inline-flex items-center">
                Issue
              </span>
            )}
            <span className="truncate">{task.title || "Untitled task"}</span>
          </span>
        }
        trailing={
          <>
            <SaveIndicator at={savedAt} />
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Trash2 size={12} />}
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete task",
                  message: `${project.key}-${task.number} will be removed.`,
                  confirmLabel: "Delete task",
                  destructive: true,
                });
                if (ok) {
                  // Snapshot BEFORE delete so Undo restores the exact
                  // task, ID and activity history intact.
                  const snapshot = task;
                  deleteTask(task.id);
                  toast.success(`Deleted ${project.key}-${task.number}`, {
                    action: {
                      label: "Undo",
                      onClick: () => restoreTask(snapshot),
                    },
                  });
                  router.push(`/projects/${project.id}`);
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-49px)]">
        <div className="col-span-12 lg:col-span-8 border-r-[1.5px] border-ink px-5 py-5">
          <Label>Title</Label>
          <Input
            value={task.title}
            onChange={(e) => updateTask(task.id, { title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="text-lg font-semibold h-10"
          />

          <div className="mt-4">
            <Label>Description</Label>
            <Textarea
              rows={10}
              value={task.description}
              onChange={(e) =>
                updateTask(task.id, { description: e.target.value })
              }
              placeholder="Write context, acceptance criteria, links…"
            />
          </div>

          <div className="mt-6">
            <div className="font-mono text-[11px] uppercase tracking-widest text-ink/60 mb-2">
              Activity · {task.activity.length + task.comments.length}
            </div>
            <ul className="border-[1.5px] border-ink bg-paper">
              {mergeActivity(task).map((a) => (
                <li
                  key={a.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 h-9 border-b-[1.5px] border-ink/10 last:border-b-0"
                >
                  <Avatar
                    user={users.find((u) => u.id === a.authorId)}
                    size={18}
                  />
                  <div className="text-xs truncate">
                    {a.kind === "comment" ? (
                      <span className="text-ink/90">{a.body}</span>
                    ) : (
                      <span className="text-ink/60">{a.message}</span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                    {timeAgo(a.at)} ago
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment…"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  variant="accent"
                  disabled={!comment.trim()}
                  onClick={() => {
                    addComment(task.id, comment);
                    setComment("");
                  }}
                >
                  Comment
                </Button>
              </div>
            </div>
          </div>
        </div>

        <aside className="col-span-12 lg:col-span-4 px-5 py-5 bg-paper-soft">
          <div className="flex flex-col gap-4">
            <Row label="Status">
              <StatusPicker
                value={task.status}
                onChange={(s) => updateTask(task.id, { status: s })}
              />
            </Row>
            <Row label="Priority">
              <PriorityPicker
                value={task.priority}
                onChange={(p) => updateTask(task.id, { priority: p })}
              />
            </Row>
            <Row label="Assignee">
              <AssigneePicker
                value={task.assigneeId}
                onChange={(id) => updateTask(task.id, { assigneeId: id })}
                restrictToProjectId={project.id}
              />
            </Row>
            <Row label="Labels">
              <LabelPicker
                values={task.labelIds}
                onChange={(ids) => updateTask(task.id, { labelIds: ids })}
              />
            </Row>
            <Row label="Type">
              <div className="flex border-[1.5px] border-ink">
                <button
                  onClick={() => updateTask(task.id, { type: "task" })}
                  className={`h-6 px-2 font-mono text-[10px] uppercase tracking-wider ${
                    task.type === "task" ? "bg-ink text-paper" : ""
                  }`}
                >
                  Task
                </button>
                <button
                  onClick={() => updateTask(task.id, { type: "issue" })}
                  className={`h-6 px-2 font-mono text-[10px] uppercase tracking-wider border-l-[1.5px] border-ink ${
                    task.type === "issue" ? "bg-ink text-paper" : ""
                  }`}
                >
                  Issue
                </button>
              </div>
            </Row>
            <Row label="Due">
              <Input
                type="date"
                value={isoToLocalDateInput(task.dueDate)}
                onChange={(e) =>
                  updateTask(task.id, {
                    dueDate: localDateInputToIso(e.target.value),
                  })
                }
                className="h-7 text-xs"
              />
            </Row>
            <Row label="Estimate">
              <Input
                type="number"
                min={0}
                max={21}
                value={task.estimate ?? ""}
                onChange={(e) =>
                  updateTask(task.id, {
                    estimate: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
                className="h-7 text-xs"
                placeholder="points"
              />
            </Row>

            <div className="pt-3 border-t-[1.5px] border-ink/10">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-2">
                Meta
              </div>
              <dl className="text-xs font-mono space-y-1">
                <div className="flex justify-between">
                  <dt className="text-ink/50 uppercase">ID</dt>
                  <dd>
                    {project.key}-{task.number}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink/50 uppercase">Created</dt>
                  <dd>{formatDateShort(task.createdAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink/50 uppercase">Updated</dt>
                  <dd>{formatDateShort(task.updatedAt)}</dd>
                </div>
                {assignee && (
                  <div className="flex justify-between">
                    <dt className="text-ink/50 uppercase">Assigned</dt>
                    <dd className="normal-case">@{assignee.handle}</dd>
                  </div>
                )}
                {taskLabels.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink/50 uppercase shrink-0">Labels</dt>
                    <dd className="truncate text-right">
                      {taskLabels.map((l) => l.name).join(", ")}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type MergedEntry = {
  id: string;
  at: string;
  authorId?: string;
  kind: "activity" | "comment";
  body?: string;
  message?: string;
};

function mergeActivity(task: {
  activity: { id: string; at: string; authorId?: string; message: string }[];
  comments: { id: string; authorId: string; body: string; createdAt: string }[];
}): MergedEntry[] {
  const act = task.activity.map<MergedEntry>((a) => ({
    id: a.id,
    at: a.at,
    authorId: a.authorId,
    kind: "activity",
    message: a.message,
  }));
  const com = task.comments.map<MergedEntry>((c) => ({
    id: c.id,
    at: c.createdAt,
    authorId: c.authorId,
    kind: "comment",
    body: c.body,
  }));
  return [...act, ...com].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}
