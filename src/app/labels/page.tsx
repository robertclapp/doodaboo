"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label as FormLabel } from "@/components/ui/Input";
import { useStore } from "@/lib/store";
import { Plus, Trash2 } from "lucide-react";
import { useConfirm, useToast } from "@/components/ToastProvider";

const LABEL_COLORS = [
  "#dc2626",
  "#f97316",
  "#eab308",
  "#16a34a",
  "#3b82f6",
  "#6b4ee4",
  "#ff5c1a",
  "#525252",
];

export default function LabelsPage() {
  const labels = useStore((s) => s.labels);
  const addLabel = useStore((s) => s.addLabel);
  const removeLabel = useStore((s) => s.removeLabel);
  const tasks = useStore((s) => s.tasks);
  const hydrated = useStore((s) => s.hydrated);
  const confirm = useConfirm();
  const toast = useToast();

  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[0]);

  if (!hydrated) return null;

  const submit = () => {
    if (!name.trim()) return;
    addLabel({ name: name.trim().toLowerCase(), color });
    setName("");
    setColor(LABEL_COLORS[0]);
  };

  return (
    <>
      <PageHeader kicker="Workspace" title="Labels" />
      <div className="p-4 grid grid-cols-12 gap-4">
        <section className="col-span-12 lg:col-span-5 border-[1.5px] border-ink bg-paper p-4">
          <div className="font-mono text-[11px] uppercase tracking-widest font-bold mb-3">
            Create label
          </div>
          <div className="space-y-3">
            <div>
              <FormLabel>Name</FormLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. regression"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
            <div>
              <FormLabel>Color</FormLabel>
              <div className="grid grid-cols-8 gap-2">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 border-[1.5px] border-ink ${
                      color === c
                        ? "shadow-brutal-sm -translate-x-[1px] -translate-y-[1px]"
                        : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <Button
              variant="accent"
              iconLeft={<Plus size={12} />}
              onClick={submit}
              disabled={!name.trim()}
            >
              Add Label
            </Button>
          </div>
        </section>

        <section className="col-span-12 lg:col-span-7 border-[1.5px] border-ink bg-paper">
          <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
            Labels · {labels.length}
          </div>
          <ul>
            {labels.map((l) => {
              const count = tasks.filter((t) => t.labelIds.includes(l.id))
                .length;
              return (
                <li
                  key={l.id}
                  className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 h-10 border-b-[1.5px] border-ink/10 last:border-b-0"
                >
                  <span
                    className="w-4 h-4 border-[1.5px] border-ink"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="text-sm font-mono">{l.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                    {count} used
                  </span>
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Remove label",
                        message: `"${l.name}" will be removed from ${count} ${count === 1 ? "task" : "tasks"}.`,
                        confirmLabel: "Remove label",
                        destructive: true,
                      });
                      if (ok) {
                        removeLabel(l.id);
                        toast.success(`Removed ${l.name}`);
                      }
                    }}
                    className="p-1 hover:bg-ink hover:text-paper"
                    aria-label="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              );
            })}
            {labels.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-ink/50 font-mono uppercase tracking-widest">
                No labels yet
              </li>
            )}
          </ul>
        </section>
      </div>
    </>
  );
}
