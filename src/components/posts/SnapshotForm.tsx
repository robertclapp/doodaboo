"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { EngagementSnapshot } from "@/lib/types";

const PRESETS = [5, 15, 30, 60];

export function SnapshotForm({
  onAdd,
  defaultMinutes = 15,
}: {
  onAdd: (s: Omit<EngagementSnapshot, "id" | "capturedAt">) => void;
  defaultMinutes?: number;
}) {
  const [atMinutes, setAtMinutes] = useState<number>(defaultMinutes);
  const [impressions, setImpressions] = useState<number>(0);
  const [views, setViews] = useState<number>(0);
  const [likes, setLikes] = useState<number>(0);
  const [comments, setComments] = useState<number>(0);
  const [shares, setShares] = useState<number>(0);
  const [saves, setSaves] = useState<number>(0);
  const [retentionPct, setRetentionPct] = useState<string>("");
  const [watchTimeAvgSec, setWatchTimeAvgSec] = useState<string>("");

  const submit = () => {
    onAdd({
      atMinutes,
      impressions,
      views,
      likes,
      comments,
      shares,
      saves,
      retentionPct: retentionPct === "" ? undefined : Number(retentionPct),
      watchTimeAvgSec:
        watchTimeAvgSec === "" ? undefined : Number(watchTimeAvgSec),
    });
    setImpressions(0);
    setViews(0);
    setLikes(0);
    setComments(0);
    setShares(0);
    setSaves(0);
    setRetentionPct("");
    setWatchTimeAvgSec("");
  };

  return (
    <div className="border-[1.5px] border-ink bg-paper">
      <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
          Add engagement snapshot
        </div>
        <div className="flex items-center gap-1">
          {PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setAtMinutes(m)}
              className={`h-6 px-2 border-[1.5px] border-ink font-mono text-[10px] uppercase tracking-widest ${
                atMinutes === m ? "bg-ink text-paper" : "bg-paper"
              }`}
            >
              T+{m}m
            </button>
          ))}
        </div>
      </div>
      <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Minute" value={atMinutes} onChange={setAtMinutes} />
        <Field label="Impressions" value={impressions} onChange={setImpressions} />
        <Field label="Views" value={views} onChange={setViews} />
        <Field label="Likes" value={likes} onChange={setLikes} />
        <Field label="Comments" value={comments} onChange={setComments} />
        <Field label="Shares" value={shares} onChange={setShares} />
        <Field label="Saves" value={saves} onChange={setSaves} />
        <div>
          <Label>
            Retention %
            <Input
              type="number"
              min={0}
              max={100}
              value={retentionPct}
              onChange={(e) => setRetentionPct(e.target.value)}
              placeholder="optional"
            />
          </Label>
        </div>
        <div>
          <Label>
            Watch time (sec)
            <Input
              type="number"
              min={0}
              value={watchTimeAvgSec}
              onChange={(e) => setWatchTimeAvgSec(e.target.value)}
              placeholder="optional"
            />
          </Label>
        </div>
      </div>
      <div className="border-t-[1.5px] border-ink/10 px-3 py-2 flex items-center justify-end gap-2">
        <Button
          variant="accent"
          iconLeft={<Plus size={12} />}
          onClick={submit}
          disabled={impressions === 0 && views === 0}
        >
          Save snapshot
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  // The input nests inside the <label> so it's implicitly associated —
  // screen readers announce the field name and tests can getByLabel().
  return (
    <div>
      <Label>
        {label}
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      </Label>
    </div>
  );
}
