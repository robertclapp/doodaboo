"use client";

import { useStore } from "@/lib/store";
import { Popover, PopoverItem } from "@/components/ui/Popover";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

export function AssigneePicker({
  value,
  onChange,
  restrictToProjectId,
  compact = false,
}: {
  value?: string;
  onChange: (id: string | undefined) => void;
  restrictToProjectId?: string;
  compact?: boolean;
}) {
  const users = useStore((s) => {
    if (!restrictToProjectId) return s.users;
    const proj = s.projects.find((p) => p.id === restrictToProjectId);
    if (!proj) return s.users;
    return s.users.filter((u) => proj.memberIds.includes(u.id));
  });
  const current = useStore((s) => s.users.find((u) => u.id === value));

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
            "inline-flex items-center gap-1.5 border-[1.5px] border-transparent hover:border-ink/30 h-6 px-1 font-mono text-[11px] uppercase tracking-wider",
          )}
        >
          <Avatar user={current} size={16} />
          {!compact && (
            <span className="normal-case">
              {current ? `@${current.handle}` : "Unassigned"}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div className="py-1 min-w-[200px]">
          <div className="px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-ink/50">
            Assignee
          </div>
          <PopoverItem
            active={!value}
            onSelect={() => {
              onChange(undefined);
              close();
            }}
            leading={<Avatar size={16} />}
          >
            Unassigned
          </PopoverItem>
          {users.map((u) => (
            <PopoverItem
              key={u.id}
              active={u.id === value}
              onSelect={() => {
                onChange(u.id);
                close();
              }}
              leading={<Avatar user={u} size={16} />}
            >
              {u.name}
              <span className="text-ink/40 ml-1">@{u.handle}</span>
            </PopoverItem>
          ))}
        </div>
      )}
    </Popover>
  );
}
