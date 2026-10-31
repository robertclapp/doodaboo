"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { isCloud } from "@/lib/backend";

export function StoreHydration() {
  useEffect(() => {
    // With `skipHydration: true`, zustand/persist does not auto-rehydrate.
    // We call it explicitly after mount so SSR and first-client render both
    // see `hydrated=false` and stay in sync, then the store loads from
    // storage on the next tick.
    //
    // In cloud mode the persisted slice is only the device theme, and
    // `hydrated` means "the store mirrors a workspace" — WorkspaceSync
    // flips it after the first query result, never this component.
    if (isCloud()) {
      Promise.resolve(useStore.persist.rehydrate()).catch((err) => {
        console.error("[doodaboo] rehydrate failed", err);
      });
      return;
    }
    // We then unconditionally flip `hydrated` to true: the persist
    // middleware's onRehydrateStorage callback only fires with a non-null
    // state when localStorage actually had data. On a fresh install (or
    // after `localStorage.clear()` in E2E tests), the loaded state is
    // undefined and the callback's `state?.setHydrated(true)` no-ops,
    // leaving every page that gates on `hydrated` rendering null forever.
    // Setting it here in a `.finally` covers both code paths.
    Promise.resolve(useStore.persist.rehydrate())
      .catch((err) => {
        console.error("[doodaboo] rehydrate failed", err);
      })
      .finally(() => {
        if (!useStore.getState().hydrated) {
          useStore.setState({ hydrated: true });
        }
      });
  }, []);
  return null;
}
