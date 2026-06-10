import { Page, expect } from "@playwright/test";

/**
 * Each E2E spec wants a deterministic starting workspace. Clearing
 * localStorage drops the persisted zustand state, so the next page load
 * falls back to the deterministic seed (`src/lib/seed.ts`).
 *
 * Wait order:
 *   1. The sidebar's "Doodaboo" — proves the React tree mounted.
 *   2. The post-rehydration `<html data-theme="…">` attribute — proves
 *      `<StoreHydration />` ran and `hydrated` flipped to true. Page
 *      bodies that gate on `hydrated` are then safe to assert against.
 */
export async function resetWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(
    page
      .getByRole("complementary", { name: /Primary navigation/i })
      .getByText("Doodaboo")
      .first(),
  ).toBeVisible();
  // ThemeManager sets data-theme after mount; once it's set, hydrated is
  // either already true or about to be in the same microtask.
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    /^(light|dark)$/,
  );
}
