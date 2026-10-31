"use client";

import type { ReactNode } from "react";

/** The standalone card the cloud screens (sign-in, picker, loading) share. */
export function CloudFrame({
  title,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-paper text-ink flex items-start justify-center p-4 pt-[12vh]">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} border-[1.5px] border-ink bg-paper shadow-brutal`}>
        <div className="h-10 border-b-[1.5px] border-ink px-3 flex items-center gap-2">
          <div className="w-6 h-6 bg-ink text-paper flex items-center justify-center font-mono font-bold text-xs">
            D
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest font-bold">{title}</div>
        </div>
        <div className="p-5 space-y-4">{children}</div>
        {footer && <div className="border-t-[1.5px] border-ink/10 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
