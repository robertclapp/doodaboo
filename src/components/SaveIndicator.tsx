"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/utils";

export type SaveState = "saved" | "saving" | "dirty";

/**
 * Visible autosave status pill. The "Unsaved — click away to save" hint that
 * used to live on the task detail page was an ADHD trap: if you closed the
 * tab or navigated away mid-thought, the not-yet-blurred field was silently
 * dropped. Pair this component with a real debounced autosave (see
 * src/app/projects/[projectId]/tasks/[taskId]/page.tsx) so users always have
 * a concrete signal that their text is on disk.
 *
 * Two display modes:
 *  - Explicit: pass `state` ("saved" | "saving" | "dirty"). The pill shows
 *    "Saving…", "Unsaved", or "Saved Ns ago" accordingly.
 *  - Flash-on-save: omit `state` and pass `at` (a Date.now() millis stamp).
 *    The pill briefly shows "● Saved" and fades, matching the original post
 *    detail behavior.
 */
export function SaveIndicator({
  state,
  lastSavedAt,
  at,
}: {
  state?: SaveState;
  lastSavedAt?: string;
  at?: number | null;
}) {
  // Re-render once a second so "Saved 2s ago" stays fresh without external ticks.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state !== "saved" || !lastSavedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state, lastSavedAt]);

  // Legacy flash-on-save mode (used by the post detail page).
  if (state === undefined) {
    return (
      <span
        className="font-mono text-[10px] uppercase tracking-widest text-ink/50 transition-opacity duration-300"
        style={{ opacity: at ? 1 : 0 }}
        aria-live="polite"
      >
        ● Saved
      </span>
    );
  }

  let label: string;
  if (state === "saving") label = "Saving…";
  else if (state === "dirty") label = "Unsaved";
  else label = lastSavedAt ? `● Saved ${timeAgo(lastSavedAt)} ago` : "● Saved";

  return (
    <span
      className="font-mono text-[10px] uppercase tracking-widest text-ink/50"
      aria-live="polite"
    >
      {label}
    </span>
  );
}
