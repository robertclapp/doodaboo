"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function StoreHydration() {
  useEffect(() => {
    // With `skipHydration: true`, zustand/persist does not auto-rehydrate.
    // We call it explicitly after mount so SSR and first-client render both
    // see `hydrated=false` and stay in sync, then the store loads from
    // localStorage on the next tick and flips `hydrated` via
    // `onRehydrateStorage`.
    void useStore.persist.rehydrate();
  }, []);
  return null;
}
