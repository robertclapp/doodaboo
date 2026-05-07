import { Page, expect } from "@playwright/test";

/**
 * Each E2E spec wants a deterministic starting workspace. Clearing
 * localStorage drops the persisted zustand state, so the next page load
 * falls back to the deterministic seed (`src/lib/seed.ts`). All E2E
 * suites should call this in beforeEach.
 *
 * We wait on a sidebar element rather than <main> because pages gate
 * their bodies on `hydrated` and render null briefly — <main> exists
 * but can have zero height, so toBeVisible never settles.
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
}
