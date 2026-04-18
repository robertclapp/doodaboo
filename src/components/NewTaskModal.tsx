"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input, Textarea, Label } from "./ui/Input";
import { ProjectPicker } from "./pickers/ProjectPicker";
import { StatusPicker } from "./pickers/StatusPicker";
import { PriorityPicker } from "./pickers/PriorityPicker";
import { AssigneePicker } from "./pickers/AssigneePicker";
import { LabelPicker } from "./pickers/LabelPicker";
import { useStore } from "@/lib/store";
import { Priority, Status, TaskType } from "@/lib/types";
import { useRouter } from "next/navigation";

export function NewTaskModal({
  open,
  onClose,
  defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
}) {
  const projects = useStore((s) => s.projects);
  const createTask = useStore((s) => s.createTask);
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);

  const [projectId, setProjectId] = useState<string | undefined>(
    defaultProjectId ?? projects[0]?.id,
  );
  const [type, setType] = useState<TaskType>("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [labelIds, setLabelIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setProjectId(defaultProjectId ?? projects[0]?.id);
      setType("task");
      setTitle("");
      setDescription("");
      setStatus("todo");
      setPriority("medium");
      setAssigneeId(undefined);
      setLabelIds([]);
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open, defaultProjectId, projects]);

  const submit = (goTo = false) => {
    if (!projectId || !title.trim()) return;
    const t = createTask({
      projectId,
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      type,
      assigneeId,
      labelIds,
    });
    onClose();
    if (goTo) router.push(`/projects/${t.projectId}/tasks/${t.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Issue"
      widthClass="max-w-2xl"
      footer={
        <>
          <div className="mr-auto font-mono text-[10px] uppercase tracking-widest text-ink/50">
            ⌘↩ to create · esc to cancel
          </div>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => submit(true)}
            disabled={!title.trim() || !projectId}
          >
            Create &amp; Open
          </Button>
          <Button
            variant="accent"
            onClick={() => submit(false)}
            disabled={!title.trim() || !projectId}
          >
            Create
          </Button>
        </>
      }
    >
      <div
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(false);
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <ProjectPicker value={projectId} onChange={setProjectId} />
          <div className="flex border-[1.5px] border-ink">
            <button
              onClick={() => setType("task")}
              className={`h-7 px-2 font-mono text-[10px] uppercase tracking-wider ${
                type === "task" ? "bg-ink text-paper" : ""
              }`}
            >
              Task
            </button>
            <button
              onClick={() => setType("issue")}
              className={`h-7 px-2 font-mono text-[10px] uppercase tracking-wider border-l-[1.5px] border-ink ${
                type === "issue" ? "bg-ink text-paper" : ""
              }`}
            >
              Issue
            </button>
          </div>
        </div>

        <div>
          <Label>Title</Label>
          <Input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Describe the work in one line…"
          />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Context, acceptance criteria, links…"
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap pt-1 border-t-[1.5px] border-ink/10">
          <StatusPicker value={status} onChange={setStatus} />
          <PriorityPicker value={priority} onChange={setPriority} />
          <AssigneePicker
            value={assigneeId}
            onChange={setAssigneeId}
            restrictToProjectId={projectId}
          />
          <LabelPicker values={labelIds} onChange={setLabelIds} />
        </div>
      </div>
    </Modal>
  );
}
