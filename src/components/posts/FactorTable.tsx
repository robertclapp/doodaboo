"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ScoreFactor } from "@/lib/types";

const GROUP_LABEL: Record<ScoreFactor["group"], string> = {
  content: "Content",
  context: "Context",
  traction: "Early traction",
  diffusion: "Diffusion",
};

const GROUP_TONE: Record<ScoreFactor["group"], string> = {
  content: "#3b4ae4",
  context: "#6b4ee4",
  traction: "#ff5c1a",
  diffusion: "#16a34a",
};

export function FactorTable({ factors }: { factors: ScoreFactor[] }) {
  const sorted = [...factors].sort((a, b) => b.contribution - a.contribution);
  const totalPossible = sorted.reduce((s, f) => s + f.weight * 100, 0);

  return (
    <div className="border-[1.5px] border-ink bg-paper">
      <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
          Why this score
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
          {sorted.length} factors · {totalPossible.toFixed(0)} pts available
        </div>
      </div>
      <ul>
        {sorted.map((f) => (
          <FactorRow key={f.id} factor={f} />
        ))}
      </ul>
    </div>
  );
}

function FactorRow({ factor }: { factor: ScoreFactor }) {
  const [open, setOpen] = useState(false);
  const max = factor.weight * 100;
  const pct = max > 0 ? (factor.contribution / max) * 100 : 0;
  const tone = GROUP_TONE[factor.group];
  return (
    <li className="border-b-[1.5px] border-ink/10 last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full grid grid-cols-[16px_auto_1fr_auto_auto] items-center gap-2 px-3 h-9 text-left hover:bg-ink/[0.03]"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span
          className="inline-block w-2 h-2"
          style={{ backgroundColor: tone, boxShadow: "inset 0 0 0 1.5px #0a0a0a" }}
        />
        <span className="text-sm truncate">
          {factor.label}
          <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-ink/40">
            {GROUP_LABEL[factor.group]}
          </span>
        </span>
        <Bar pct={pct} tone={tone} />
        <span className="font-mono text-[11px] tabular-nums w-14 text-right">
          {factor.contribution > 0 ? "+" : ""}
          {factor.contribution.toFixed(1)}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 grid grid-cols-[24px_1fr] gap-x-2">
          <span />
          <div className="text-xs text-ink/70">{factor.hint}</div>
          <span />
          <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-widest text-ink/50">
            <Stat label="Quality" value={`${(factor.raw * 100).toFixed(0)}%`} />
            <Stat label="Weight" value={`${(factor.weight * 100).toFixed(1)}%`} />
            <Stat label="Max" value={`+${max.toFixed(1)}`} />
          </div>
        </div>
      )}
    </li>
  );
}

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="w-32 h-2 border-[1.5px] border-ink relative">
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          backgroundColor: tone,
          transition: "width 400ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-[1.5px] border-ink/20 px-2 py-1">
      <div className="text-[9px]">{label}</div>
      <div className="text-ink text-xs">{value}</div>
    </div>
  );
}
