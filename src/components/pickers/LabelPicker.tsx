"use client";

import { useStore } from "@/lib/store";
import { Popover, PopoverItem } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { Check, Tag } from "lucide-react";

export function LabelPicker({
  values,
  onChange,
  compact = false,
}: {
  values: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const labels = useStore((s) => s.labels);
  const selected = labels.filter((l) => values.includes(l.id));

  return (
    <Popover
      closeOnClick={false}
      trigger={({ toggle, ref }) => (
        <button
          ref={ref}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className={cn(
            "inline-flex items-center gap-1 border-[1.5px] border-transparent hover:border-ink/30 h-6 px-1.5 font-mono text-[11px] uppercase tracking-wider",
          )}
        >
          {selected.length === 0 ? (
            <>
              <Tag size={11} />
              {!compact && <span>Labels</span>}
            </>
          ) : (
            <div className="flex items-center gap-1">
              {selected.slice(0, 3).map((l) => (
                <span
                  key={l.id}
                  className="h-2 w-2 border-[1.5px] border-ink"
                  style={{ backgroundColor: l.color }}
                />
              ))}
              {!compact && (
                <span className="normal-case text-ink/70">
                  {selected.length === 1
                    ? selected[0].name
                    : `${selected.length} labels`}
                </span>
              )}
            </div>
          )}
        </button>
      )}
    >
      {() => (
        <div className="py-1 min-w-[200px]">
          <div className="px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-ink/50">
            Labels
          </div>
          {labels.map((l) => {
            const on = values.includes(l.id);
            return (
              <PopoverItem
                key={l.id}
                active={on}
                onSelect={() => {
                  onChange(
                    on ? values.filter((v) => v !== l.id) : [...values, l.id],
                  );
                }}
                leading={
                  <span
                    className="h-2.5 w-2.5 border-[1.5px] border-ink"
                    style={{ backgroundColor: l.color }}
                  />
                }
                trailing={on ? <Check size={12} /> : null}
              >
                {l.name}
              </PopoverItem>
            );
          })}
          {labels.length === 0 && (
            <div className="px-2 py-2 text-xs text-ink/50">
              No labels yet. Create them on the Labels page.
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
