"use client";

import { cn } from "@/lib/utils";
import { User } from "@/lib/types";
import { initials } from "@/lib/utils";

export function Avatar({
  user,
  size = 20,
  className,
  title,
}: {
  user?: User;
  size?: number;
  className?: string;
  title?: string;
}) {
  if (!user) {
    return (
      <span
        title={title ?? "Unassigned"}
        style={{ width: size, height: size }}
        className={cn(
          "inline-flex items-center justify-center border-[1.5px] border-dashed border-ink/40 text-ink/40 font-mono",
          className,
        )}
      >
        <span style={{ fontSize: Math.round(size * 0.5) }}>?</span>
      </span>
    );
  }
  return (
    <span
      title={title ?? `${user.name} (@${user.handle})`}
      style={{
        width: size,
        height: size,
        backgroundColor: user.color,
      }}
      className={cn(
        "inline-flex items-center justify-center border-[1.5px] border-ink text-[10px] font-bold text-paper font-mono",
        className,
      )}
    >
      {initials(user.name)}
    </span>
  );
}

export function AvatarStack({
  users,
  max = 4,
  size = 20,
}: {
  users: (User | undefined)[];
  max?: number;
  size?: number;
}) {
  const visible = users.filter(Boolean).slice(0, max) as User[];
  const hidden = Math.max(0, users.filter(Boolean).length - visible.length);
  return (
    <div className="flex -space-x-1">
      {visible.map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {hidden > 0 && (
        <span
          style={{ width: size, height: size }}
          className="inline-flex items-center justify-center border-[1.5px] border-ink bg-paper text-[10px] font-mono"
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}
