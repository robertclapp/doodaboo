"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  footer,
  widthClass = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
  widthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]"
      role="dialog"
      aria-modal
    >
      <div
        className="absolute inset-0 bg-ink/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full border-[1.5px] border-ink bg-paper shadow-brutal-lg",
          widthClass,
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b-[1.5px] border-ink px-4 h-11">
            <div className="font-mono text-xs uppercase tracking-wider">
              {title}
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-ink hover:text-paper transition-colors"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t-[1.5px] border-ink bg-paper-soft px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
