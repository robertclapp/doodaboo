"use client";

import { useSearchParams } from "next/navigation";
import { ID_PARAM } from "./routes";

/**
 * The record id carried by the current URL's query string (`?id=…`), or ""
 * when absent. Pair with `routes.post(id)` and friends from ./routes.
 *
 * Reads through `useSearchParams`, so the calling page must sit inside a
 * `<Suspense>` boundary — Next 15 fails the build otherwise. Every detail
 * page wraps itself in one with `fallback={null}`, which is indistinguishable
 * from today's behavior because those pages already render nothing until the
 * store reports `hydrated`.
 */
export function useIdParam(): string {
  return useSearchParams().get(ID_PARAM) ?? "";
}
