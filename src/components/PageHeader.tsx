"use client";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  kicker,
  trailing,
  tabs,
  className,
}: {
  title: React.ReactNode;
  kicker?: React.ReactNode;
  trailing?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-b-[1.5px] border-ink bg-paper sticky top-0 z-20",
        className,
      )}
    >
      <div className="flex items-center justify-between h-12 px-4">
        <div className="flex items-center gap-2 min-w-0">
          {kicker && (
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 pr-2 border-r-[1.5px] border-ink/20">
              {kicker}
            </div>
          )}
          <div className="font-bold tracking-tight truncate text-sm">
            {title}
          </div>
        </div>
        <div className="flex items-center gap-2">{trailing}</div>
      </div>
      {tabs && (
        <div className="flex items-center h-9 border-t-[1.5px] border-ink/20 px-2 gap-1">
          {tabs}
        </div>
      )}
    </div>
  );
}

export function Tab({
  active,
  children,
  onClick,
  count,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 px-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors border-[1.5px]",
        active
          ? "bg-ink text-paper border-ink"
          : "bg-transparent border-transparent hover:border-ink/30",
      )}
    >
      {children}
      {typeof count === "number" && (
        <span
          className={cn(
            "font-mono text-[9px] border-[1.5px] px-1",
            active ? "bg-paper text-ink border-paper" : "border-ink/30",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
