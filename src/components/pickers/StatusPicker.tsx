"use client";

import { Status, STATUSES } from "@/lib/types";
import { Popover, PopoverItem } from "@/components/ui/Popover";
import { StatusIcon } from "@/components/StatusIcon";
import { cn } from "@/lib/utils";

export function StatusPicker({
  value,
  onChange,
  compact = false,
}: {
  value: Status;
  onChange: (s: Status) => void;
  compact?: boolean;
}) {
  const current = STATUSES.find((s) => s.id === value)!;
  return (
    <Popover
      trigger={({ toggle, ref }) => (
        <button
          ref={ref}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className={cn(
            "inline-flex items-center gap-1.5 border-[1.5px] border-transparent hover:border-ink/30 h-6 px-1.5 font-mono text-[11px] uppercase tracking-wider",
            !compact && "bg-transparent",
          )}
        >
          <StatusIcon status={value} />
          {!compact && <span>{current.label}</span>}
        </button>
      )}
    >
      {(close) => (
        <div className="py-1">
          <div className="px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-ink/50">
            Status
          </div>
          {STATUSES.map((s) => (
            <PopoverItem
              key={s.id}
              active={s.id === value}
              onSelect={() => {
                onChange(s.id);
                close();
              }}
              leading={<StatusIcon status={s.id} />}
            >
              {s.label}
            </PopoverItem>
          ))}
        </div>
      )}
    </Popover>
  );
}
