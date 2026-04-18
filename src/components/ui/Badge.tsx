"use client";

import { cn } from "@/lib/utils";

export function Badge({
  children,
  color,
  className,
  mono = true,
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border-[1.5px] border-ink px-1.5 h-5 text-[10px] uppercase tracking-wider",
        mono && "font-mono",
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      {children}
    </span>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: "inset 0 0 0 1.5px #0a0a0a",
      }}
      className="inline-block"
    />
  );
}
