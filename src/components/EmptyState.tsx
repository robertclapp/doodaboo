"use client";

import { ReactNode } from "react";

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="border-[1.5px] border-dashed border-ink/30 bg-paper p-8 flex flex-col items-center text-center">
      {icon && <div className="mb-3 text-ink/40">{icon}</div>}
      <div className="font-mono text-[11px] uppercase tracking-widest text-ink/60">
        {title}
      </div>
      {hint && (
        <div className="mt-2 text-sm text-ink/60 max-w-sm">{hint}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
