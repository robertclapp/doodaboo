"use client";

import { useState } from "react";
import { BookOpen, Check, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Post } from "@/lib/types";
import {
  applyPlaybook,
  getPlaybook,
  Playbook,
  playbooksFor,
} from "@/lib/playbooks";
import { describeBand, scoreIntrinsic } from "@/lib/virality";

/**
 * Modal-based picker that previews the score change before committing.
 * Apply is split into a preview + confirm so the user always sees what
 * they're trading.
 */
export function PlaybookPicker({
  post,
  onApply,
  trigger,
}: {
  post: Post;
  onApply: (patch: {
    content: Post["content"];
    context: Post["context"];
    playbookId: string;
  }) => void;
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Playbook | null>(null);

  const close = () => {
    setOpen(false);
    setSelected(null);
  };

  const applicable = playbooksFor(post.platform);
  const currentPlaybook = post.playbookId ? getPlaybook(post.playbookId) : undefined;

  const beforeScore = scoreIntrinsic(post);
  const previewScore = selected
    ? scoreIntrinsic({ ...post, ...applyPlaybook(post, selected).patch })
    : undefined;
  const previewChanges = selected
    ? applyPlaybook(post, selected).changes
    : [];

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button
          variant="outline"
          size="sm"
          iconLeft={<BookOpen size={12} />}
          onClick={() => setOpen(true)}
        >
          {currentPlaybook ? `Playbook · ${currentPlaybook.name}` : "Apply playbook"}
        </Button>
      )}

      <Modal
        open={open}
        onClose={close}
        title="Apply a playbook"
        widthClass="max-w-3xl"
        footer={
          <>
            <div className="mr-auto font-mono text-[10px] uppercase tracking-widest text-ink/50">
              {applicable.length} playbook
              {applicable.length === 1 ? "" : "s"} for{" "}
              {post.platform.replace("_", " ")}
            </div>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                const { patch } = applyPlaybook(post, selected);
                onApply({ ...patch, playbookId: selected.id });
                close();
              }}
            >
              Apply playbook
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-12 gap-3">
          <ul className="col-span-12 md:col-span-5 space-y-1.5 max-h-[440px] overflow-y-auto pr-1">
            {applicable.length === 0 && (
              <li className="border-[1.5px] border-dashed border-ink/30 p-4 font-mono text-[10px] uppercase tracking-widest text-ink/50 text-center">
                No playbooks for {post.platform.replace("_", " ")} yet.
              </li>
            )}
            {applicable.map((p) => {
              const active = selected?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p)}
                    className={`w-full text-left p-3 border-[1.5px] border-ink ${
                      active
                        ? "bg-ink text-paper"
                        : "bg-paper hover:-translate-y-[1px] hover:shadow-brutal-sm"
                    } transition-all`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-mono text-[10px] uppercase tracking-widest opacity-70">
                        {p.category}
                      </div>
                      {currentPlaybook?.id === p.id && (
                        <span className="font-mono text-[9px] uppercase tracking-widest border-[1.5px] border-current px-1">
                          current
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-sm leading-tight">
                      {p.name}
                    </div>
                    <div
                      className={`text-xs mt-1 ${active ? "text-paper/80" : "text-ink/70"}`}
                    >
                      {p.description}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="col-span-12 md:col-span-7">
            {selected ? (
              <PreviewPanel
                playbook={selected}
                changes={previewChanges}
                before={beforeScore.value}
                after={previewScore?.value ?? beforeScore.value}
                afterBand={previewScore?.band ?? beforeScore.band}
              />
            ) : (
              <div className="border-[1.5px] border-dashed border-ink/30 p-6 h-full flex items-center justify-center text-center">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink/60">
                    Select a playbook
                  </div>
                  <div className="mt-2 text-xs text-ink/50 max-w-xs">
                    The preview will show what changes and how the predicted
                    score moves before you apply it.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function PreviewPanel({
  playbook,
  changes,
  before,
  after,
  afterBand,
}: {
  playbook: Playbook;
  changes: string[];
  before: number;
  after: number;
  afterBand: ReturnType<typeof scoreIntrinsic>["band"];
}) {
  const delta = after - before;
  const tone = describeBand(afterBand).tone;
  return (
    <div className="border-[1.5px] border-ink bg-paper">
      <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
          Preview · {playbook.name}
        </div>
        <div
          className="inline-flex items-center font-mono text-[11px] uppercase tracking-widest border-[1.5px] border-ink px-1 h-5"
          style={{ backgroundColor: tone }}
        >
          {describeBand(afterBand).label}
        </div>
      </div>
      <div className="p-3 grid grid-cols-3 gap-2">
        <Stat label="Before" value={before.toFixed(1)} />
        <Stat
          label="After"
          value={after.toFixed(1)}
          tone={tone}
        />
        <Stat
          label="Δ"
          value={`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
          tone={delta >= 0 ? "#c4f000" : "#dc2626"}
          dark={delta < 0}
        />
      </div>
      <div className="border-t-[1.5px] border-ink/10 p-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-1.5">
          Changes
        </div>
        <ul className="space-y-1">
          {changes.map((c, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs"
            >
              {c.startsWith("No changes") ? (
                <X size={11} className="mt-1 shrink-0 text-ink/40" />
              ) : (
                <Check size={11} className="mt-1 shrink-0" />
              )}
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t-[1.5px] border-ink/10 p-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-1.5">
          Notes
        </div>
        <ul className="space-y-1">
          {playbook.notes.map((n, i) => (
            <li key={i} className="text-xs text-ink/70 leading-snug">
              · {n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "var(--paper-soft-hex)",
  dark = false,
}: {
  label: string;
  value: string;
  tone?: string;
  dark?: boolean;
}) {
  return (
    <div
      className="border-[1.5px] border-ink p-2"
      style={{ backgroundColor: tone, color: dark ? "var(--paper-hex)" : undefined }}
    >
      <div className="font-mono text-[9px] uppercase tracking-widest opacity-60">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
    </div>
  );
}
