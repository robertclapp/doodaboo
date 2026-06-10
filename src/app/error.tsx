"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Centralized client-side error logging point. Replace with Sentry,
    // PostHog, etc. when adding observability — until then, the console
    // is the only sink.
    console.error("[doodaboo] route error", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="border-[1.5px] border-ink bg-paper shadow-brutal max-w-lg w-full">
        <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest font-bold">
          <span>Something broke</span>
          {error.digest && (
            <span className="text-ink/40 normal-case text-[10px]">
              {error.digest}
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="font-mono text-4xl font-bold leading-none">ERR</div>
          <p className="text-sm text-ink/80">
            This page hit an unexpected error. Your data is still on disk —
            try the same action again, or jump back home.
          </p>
          {process.env.NODE_ENV !== "production" && (
            <pre className="text-[11px] font-mono whitespace-pre-wrap bg-paper-soft border-[1.5px] border-ink/20 p-2 max-h-40 overflow-auto">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          )}
          <div className="flex items-center gap-2 pt-2 border-t-[1.5px] border-ink/10">
            <button
              onClick={reset}
              className="inline-flex items-center h-9 px-3 border-[1.5px] border-ink bg-accent font-mono text-[11px] uppercase tracking-wider hover:-translate-y-[1px] hover:shadow-brutal-sm transition-all"
            >
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex items-center h-9 px-3 border-[1.5px] border-ink bg-paper font-mono text-[11px] uppercase tracking-wider hover:-translate-y-[1px] hover:shadow-brutal-sm transition-all"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
