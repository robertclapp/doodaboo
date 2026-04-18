"use client";

import { useStore } from "@/lib/store";
import { Popover, PopoverItem } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

export function ProjectPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (id: string) => void;
}) {
  const projects = useStore((s) => s.projects);
  const current = projects.find((p) => p.id === value);
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
            "inline-flex items-center gap-1.5 border-[1.5px] border-ink h-7 px-2 bg-paper font-mono text-[11px] uppercase tracking-wider",
          )}
        >
          {current ? (
            <>
              <span
                className="w-4 h-4 flex items-center justify-center border-[1.5px] border-ink font-mono text-[9px] font-bold"
                style={{ backgroundColor: current.accent }}
              >
                {current.icon}
              </span>
              <span>{current.key}</span>
              <span className="normal-case text-ink/60">· {current.name}</span>
            </>
          ) : (
            <span>Select project</span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div className="py-1 min-w-[260px] max-h-[260px] overflow-y-auto">
          <div className="px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-ink/50">
            Projects
          </div>
          {projects.map((p) => (
            <PopoverItem
              key={p.id}
              active={p.id === value}
              onSelect={() => {
                onChange(p.id);
                close();
              }}
              leading={
                <span
                  className="w-4 h-4 flex items-center justify-center border-[1.5px] border-ink font-mono text-[9px] font-bold"
                  style={{ backgroundColor: p.accent }}
                >
                  {p.icon}
                </span>
              }
              trailing={
                <span className="font-mono text-[9px] text-ink/50">
                  {p.key}
                </span>
              }
            >
              {p.name}
            </PopoverItem>
          ))}
        </div>
      )}
    </Popover>
  );
}
