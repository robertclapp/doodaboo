"use client";

import { useStore } from "./store";

/**
 * Read-side helper: returns whether the persistent store has finished
 * rehydrating from localStorage. Pages return null when this is false to
 * avoid showing stale seed content briefly before the user's data loads.
 */
export function useHydrated(): boolean {
  return useStore((s) => s.hydrated);
}
