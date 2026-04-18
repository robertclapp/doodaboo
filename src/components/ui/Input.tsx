"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={cn(
        "w-full h-9 px-3 bg-paper border-[1.5px] border-ink text-sm placeholder:text-ink/40 focus:outline-none focus:shadow-brutal-sm focus:-translate-x-[1px] focus:-translate-y-[1px] transition-all",
        className,
      )}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={cn(
        "w-full px-3 py-2 bg-paper border-[1.5px] border-ink text-sm placeholder:text-ink/40 focus:outline-none focus:shadow-brutal-sm focus:-translate-x-[1px] focus:-translate-y-[1px] transition-all resize-none",
        className,
      )}
    />
  );
});

export function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "block font-mono text-[10px] uppercase tracking-wider text-ink/60 mb-1",
        className,
      )}
    >
      {children}
    </label>
  );
}
