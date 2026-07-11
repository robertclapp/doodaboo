import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

/**
 * The roadmap's full post lifecycle: compose a post, watch the intrinsic
 * score react, publish it, capture an engagement snapshot, and confirm
 * the live blended score picks the snapshot up. This is the core loop
 * the product exists for, exercised end-to-end through real UI.
 */
test.describe("Post loop: create → score → snapshot → live score", () => {
  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  test("composing, publishing, and snapshotting a post updates the live score", async ({
    page,
  }) => {
    await page.goto("/posts/new");

    await page.getByPlaceholder(/Working title/i).fill("E2E loop post");
    const scoreValue = page.getByTestId("score-value").first();
    await expect(scoreValue).toBeVisible();

    // A strong hook moves the intrinsic score — same signal the composer
    // spec asserts, repeated here because the loop depends on it.
    const before = Number((await scoreValue.textContent()) ?? "0");
    await page
      .getByPlaceholder(/Stop scrolling/i)
      .fill("Stop guessing your reach. This 3-step scoring loop fixed it.");
    await expect
      .poll(async () => Number((await scoreValue.textContent()) ?? "0"), {
        timeout: 5_000,
      })
      .toBeGreaterThan(before);

    await page.getByRole("button", { name: /Mark live/i }).click();
    await expect(page).toHaveURL(/\/posts\/po_/);

    // Fresh post: no snapshots, so no live blended gauge yet —
    // scoreLive() returns undefined until the first snapshot lands.
    await expect(page.getByText(/Snapshots · 0/i)).toBeVisible();
    await expect(page.getByText(/No engagement data yet/i)).toBeVisible();
    await expect(page.getByText(/Updated from/i)).toHaveCount(0);

    // Capture a T+5m engagement snapshot (labels are associated with
    // their inputs, so getByLabel drives the real form).
    await page.getByLabel(/^Views$/).fill("1200");
    await page.getByLabel(/^Likes$/).fill("90");
    await page.getByLabel(/^Shares$/).fill("30");
    await page.getByRole("button", { name: /Save snapshot/i }).click();

    // The snapshot lands in the list and the live score reblends.
    await expect(page.getByText(/Snapshots · 1/i)).toBeVisible();
    await expect(page.getByText(/Updated from 1 snapshot\b/i)).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: /1\.2k views/i }),
    ).toBeVisible();

    // And it survives a reload — the loop is persisted, not ephemeral.
    await page.reload();
    await expect(page.getByText(/Snapshots · 1/i)).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: /1\.2k views/i }),
    ).toBeVisible();
  });
});
