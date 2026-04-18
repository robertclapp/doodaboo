"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StatusPicker } from "@/components/pickers/StatusPicker";
import { PriorityPicker } from "@/components/pickers/PriorityPicker";
import { AssigneePicker } from "@/components/pickers/AssigneePicker";
import { useStore } from "@/lib/store";
import { Priority, Status } from "@/lib/types";
import { slug } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const ACCENTS = [
  "#ff5c1a",
  "#c4f000",
  "#3b4ae4",
  "#6b4ee4",
  "#16a34a",
  "#dc2626",
  "#0a0a0a",
  "#eab308",
];

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useStore((s) => s.createProject);
  const existingKeys = useStore((s) =>
    new Set(s.projects.map((p) => p.key.toUpperCase())),
  );
  const users = useStore((s) => s.users);

  const [name, setName] = useState("");
  const [keyRaw, setKeyRaw] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [leadId, setLeadId] = useState<string | undefined>(users[0]?.id);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [targetDate, setTargetDate] = useState("");

  const suggestedKey = useMemo(
    () => slug(name) || "PRJ",
    [name],
  );
  const key = (keyRaw || suggestedKey).toUpperCase().slice(0, 4);
  const keyConflict = existingKeys.has(key);

  const canSubmit = name.trim().length > 0 && !keyConflict;

  const submit = () => {
    if (!canSubmit) return;
    const proj = createProject({
      name: name.trim(),
      key,
      description: description.trim(),
      status,
      priority,
      leadId,
      memberIds: Array.from(new Set([...(leadId ? [leadId] : []), ...memberIds])),
      targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
      accent,
      icon: name.trim().charAt(0).toUpperCase() || "P",
    });
    router.push(`/projects/${proj.id}`);
  };

  return (
    <>
      <PageHeader
        kicker={
          <Link
            href="/projects"
            className="flex items-center gap-1 hover:text-ink"
          >
            <ArrowLeft size={11} /> Projects
          </Link>
        }
        title="New Project"
      />
      <div className="p-6 max-w-3xl">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-8 space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Marketing Website"
                autoFocus
              />
            </div>
            <div>
              <Label>Identifier (KEY)</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={keyRaw}
                  onChange={(e) =>
                    setKeyRaw(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  }
                  maxLength={4}
                  placeholder={suggestedKey}
                  className="max-w-[140px] font-mono uppercase"
                />
                <span className="font-mono text-[11px] text-ink/50 uppercase tracking-wider">
                  Preview: {key}-1, {key}-2, …
                </span>
              </div>
              {keyConflict && (
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-priority-urgent">
                  Key already in use
                </div>
              )}
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's the scope of this project?"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t-[1.5px] border-ink/10">
              <StatusPicker value={status} onChange={setStatus} />
              <PriorityPicker value={priority} onChange={setPriority} />
              <AssigneePicker value={leadId} onChange={setLeadId} />
            </div>
            <div>
              <Label>Target date</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="max-w-[200px]"
              />
            </div>
            <div>
              <Label>Members</Label>
              <div className="flex flex-wrap gap-2">
                {users.map((u) => {
                  const on = memberIds.includes(u.id) || u.id === leadId;
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        if (u.id === leadId) return;
                        setMemberIds((prev) =>
                          prev.includes(u.id)
                            ? prev.filter((id) => id !== u.id)
                            : [...prev, u.id],
                        );
                      }}
                      className={`flex items-center gap-2 h-8 px-2 border-[1.5px] border-ink font-mono text-[11px] uppercase tracking-wider ${
                        on ? "bg-ink text-paper" : "bg-paper"
                      }`}
                    >
                      <span
                        className="w-3 h-3"
                        style={{ backgroundColor: u.color }}
                      />
                      {u.name}
                      {u.id === leadId && (
                        <span className="ml-1 text-[9px] opacity-60">LEAD</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="col-span-12 md:col-span-4 space-y-3">
            <Label>Accent</Label>
            <div className="grid grid-cols-4 gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setAccent(c)}
                  className={`h-10 border-[1.5px] border-ink ${accent === c ? "shadow-brutal-sm -translate-x-[1px] -translate-y-[1px]" : ""}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
            <div className="border-[1.5px] border-ink bg-paper p-3 mt-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-2">
                Preview
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-9 h-9 flex items-center justify-center border-[1.5px] border-ink font-mono font-bold"
                  style={{ backgroundColor: accent }}
                >
                  {(name || "P").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">
                    {name || "Project name"}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                    {key} · {priority} · {status.replace("_", " ")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-6 pt-4 border-t-[1.5px] border-ink">
          <Button variant="ghost" onClick={() => router.push("/projects")}>
            Cancel
          </Button>
          <Button variant="accent" onClick={submit} disabled={!canSubmit}>
            Create Project
          </Button>
        </div>
      </div>
    </>
  );
}
