"use client";

import { Lightbulb } from "lucide-react";
import { Recommendation } from "@/lib/virality";

export function Recommendations({ items }: { items: Recommendation[] }) {
  if (items.length === 0) {
    return (
      <div className="border-[1.5px] border-ink bg-paper">
        <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
          <Lightbulb size={12} className="mr-1.5" /> Recommendations
        </div>
        <div className="p-3 font-mono text-[10px] uppercase tracking-widest text-ink/50">
          No obvious wins left — every factor is strong.
        </div>
      </div>
    );
  }

  return (
    <div className="border-[1.5px] border-ink bg-paper">
      <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-widest font-bold flex items-center">
          <Lightbulb size={12} className="mr-1.5" /> Recommendations
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
          Up to +
          {items.reduce((s, r) => s + r.potentialGain, 0).toFixed(1)} pts
        </div>
      </div>
      <ul>
        {items.map((r) => (
          <li
            key={r.factorId}
            className="grid grid-cols-[1fr_auto] items-start gap-3 px-3 py-2 border-b-[1.5px] border-ink/10 last:border-b-0"
          >
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink/60">
                {r.label}
              </div>
              <div className="text-sm leading-snug text-ink">{r.message}</div>
            </div>
            <div className="font-mono text-[11px] tabular-nums bg-accent text-ink border-[1.5px] border-ink px-1 h-5 inline-flex items-center mt-0.5">
              +{r.potentialGain.toFixed(1)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
