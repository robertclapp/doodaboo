"use client";

import { Priority, PRIORITIES } from "@/lib/types";
import { Popover, PopoverItem } from "@/components/ui/Popover";
import { PriorityIcon } from "@/components/PriorityIcon";
import { cn } from "@/lib/utils";

export function PriorityPicker({
  value,
  onChange,
  compact = false,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  compact?: boolean;
}) {
  const current = PRIORITIES.find((p) => p.id === value)!;
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
          )}
        >
          <PriorityIcon priority={value} />
          {!compact && <span>{current.label}</span>}
        </button>
      )}
    >
      {(close) => (
        <div className="py-1">
          <div className="px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-ink/50">
            Priority
          </div>
          {PRIORITIES.map((p) => (
            <PopoverItem
              key={p.id}
              active={p.id === value}
              onSelect={() => {
                onChange(p.id);
                close();
              }}
              leading={<PriorityIcon priority={p.id} />}
            >
              {p.label}
            </PopoverItem>
          ))}
        </div>
      )}
    </Popover>
  );
}
