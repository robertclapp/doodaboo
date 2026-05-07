import { Page, expect } from "@playwright/test";

/**
 * Each E2E spec wants a deterministic starting workspace. Clearing
 * localStorage drops the persisted zustand state, so the next page load
 * falls back to the deterministic seed (`src/lib/seed.ts`). All E2E
 * suites should call this in beforeEach.
 */
export async function resetWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  // Bodies gate on `hydrated`; wait until that flips before asserting.
  await expect(page.getByRole("main")).toBeVisible();
}

export async function openCommandPalette(page: Page): Promise<void> {
  // Cmd on macOS, Ctrl elsewhere — Playwright's "ControlOrMeta" handles both.
  await page.keyboard.press("ControlOrMeta+k");
}
