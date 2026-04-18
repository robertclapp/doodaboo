"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-ink text-paper border-ink hover:bg-ink-soft active:translate-y-[1px]",
  ghost:
    "bg-transparent text-ink border-transparent hover:bg-ink/5 hover:border-ink/10",
  outline:
    "bg-paper text-ink border-ink hover:-translate-y-[1px] hover:shadow-brutal-sm active:translate-y-[1px] active:shadow-none",
  danger:
    "bg-priority-urgent text-paper border-ink hover:-translate-y-[1px] hover:shadow-brutal-sm",
  accent:
    "bg-accent text-ink border-ink hover:-translate-y-[1px] hover:shadow-brutal-sm active:translate-y-[1px] active:shadow-none",
};

const sizeClass: Record<Size, string> = {
  sm: "h-7 px-2 text-[11px]",
  md: "h-9 px-3 text-xs",
  lg: "h-11 px-4 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "outline", size = "md", iconLeft, iconRight, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 border-[1.5px] font-mono uppercase tracking-wide transition-all select-none disabled:opacity-40 disabled:cursor-not-allowed",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
});
