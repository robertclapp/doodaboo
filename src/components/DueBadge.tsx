"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { DueStatus, dueStatus, formatDateShort } from "@/lib/utils";

const STYLE: Record<DueStatus, string> = {
  overdue: "bg-priority-urgent text-paper border-ink",
  today: "bg-accent text-ink border-ink",
  soon: "bg-paper text-ink border-ink",
  later: "bg-transparent text-ink/60 border-ink/30",
  none: "bg-transparent text-ink/40 border-ink/20",
};

const LABEL: Record<DueStatus, string> = {
  overdue: "Overdue",
  today: "Today",
  soon: "Soon",
  later: "",
  none: "",
};

export function DueBadge({ iso }: { iso?: string }) {
  // Render static on first paint (server + client) to match, then refine
  // once mounted so we can compare against the user's local "now".
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!iso) return <span className="font-mono text-[10px] text-ink/30">—</span>;

  const status: DueStatus = mounted ? dueStatus(iso) : "later";
  const className = STYLE[status];
  const label = LABEL[status];

  return (
    <span
      className={`inline-flex items-center gap-1 border-[1.5px] h-5 px-1 font-mono text-[10px] uppercase tracking-wider ${className}`}
      title={new Date(iso).toLocaleString()}
    >
      <CalendarClock size={10} />
      {label && <span>{label}</span>}
      <span>{formatDateShort(iso)}</span>
    </span>
  );
}
