"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

/**
 * Applies the persisted theme preference to the <html data-theme="…">
 * attribute and listens to OS-level color scheme changes when the user
 * has chosen "system". The first paint is handled by the inline
 * `<script>` in `app/layout.tsx`; this hook keeps the attribute in sync
 * with subsequent state changes.
 */
export function ThemeManager() {
  const theme = useStore((s) => s.theme);
  const hydrated = useStore((s) => s.hydrated);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      const resolved =
        theme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme, hydrated]);

  return null;
}
