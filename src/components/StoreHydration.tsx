"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function StoreHydration() {
  useEffect(() => {
    // Trigger rehydration flag after mount
    useStore.persist?.rehydrate?.();
  }, []);
  return null;
}
