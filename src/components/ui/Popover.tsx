"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function Popover({
  trigger,
  children,
  align = "start",
  className,
  widthClass = "min-w-[220px]",
  closeOnClick = true,
}: {
  trigger: (props: {
    open: boolean;
    toggle: () => void;
    ref: React.MutableRefObject<HTMLButtonElement | null>;
  }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  className?: string;
  widthClass?: string;
  closeOnClick?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        panelRef.current?.contains(t) ||
        buttonRef.current?.contains(t)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block">
      {trigger({
        open,
        toggle: () => setOpen((v) => !v),
        ref: buttonRef,
      })}
      {open && (
        <div
          ref={panelRef}
          onClick={() => {
            if (closeOnClick) setOpen(false);
          }}
          className={cn(
            "absolute z-40 mt-1 border-[1.5px] border-ink bg-paper shadow-brutal",
            align === "end" ? "right-0" : "left-0",
            widthClass,
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function PopoverItem({
  children,
  onSelect,
  active,
  leading,
  trailing,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  active?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      className={cn(
        "w-full flex items-center gap-2 h-8 px-2 text-xs text-left hover:bg-ink hover:text-paper transition-colors",
        active && "bg-ink/5",
      )}
    >
      {leading && <span className="w-4 flex justify-center">{leading}</span>}
      <span className="flex-1 truncate">{children}</span>
      {trailing}
    </button>
  );
}
