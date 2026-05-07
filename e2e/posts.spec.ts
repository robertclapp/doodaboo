import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test.describe("Posts + virality predictor", () => {
  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  test("posts list shows the seed posts with platform glyphs", async ({
    page,
  }) => {
    await page.goto("/posts");
    await expect(
      page.getByRole("main").getByText(/Brutalist drop teaser/i),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText(/Carousel: 5 brutalist patterns/i),
    ).toBeVisible();
  });

  test("composer score moves up as the user fills in a strong hook", async ({
    page,
  }) => {
    await page.goto("/posts/new");
    await page.getByPlaceholder(/Working title/i).fill("E2E hook test");

    const scoreValue = page.getByTestId("score-value").first();
    await expect(scoreValue).toBeVisible();
    const initial = Number((await scoreValue.textContent()) ?? "0");

    await page
      .getByPlaceholder(/Stop scrolling/i)
      .fill("Stop using analytics dashboards. Try this 3-step routine.");

    // Wait for the gauge to recompute. toHaveText supports a regex but here
    // we just need a stable, larger value — poll via Playwright's auto-retry.
    await expect
      .poll(async () => Number((await scoreValue.textContent()) ?? "0"), {
        timeout: 5_000,
      })
      .toBeGreaterThan(initial);
  });

  test("Hook Lab generates variants and spawns a draft", async ({ page }) => {
    await page.goto("/posts/lab");
    await page
      .getByPlaceholder(/pricing pages, ai onboarding/i)
      .fill("brutalist UI");

    const firstUseBtn = page
      .getByRole("button", { name: /^Use this$/i })
      .first();
    await expect(firstUseBtn).toBeVisible();
    await firstUseBtn.click();

    await expect(page).toHaveURL(/\/posts\/po_/);
    // Either the live blended gauge or the intrinsic gauge will be present.
    await expect(page.getByTestId("score-value").first()).toBeVisible();
  });

  test("compare view accepts ?ids= and renders multiple lanes", async ({
    page,
  }) => {
    await page.goto(
      "/posts/compare?ids=po_brutalist_drop,po_carousel_breakdown",
    );
    await expect(
      page.getByRole("main").getByText(/Brutalist drop teaser/i),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText(/Carousel: 5 brutalist patterns/i),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText(/Factor breakdown/i),
    ).toBeVisible();
  });

  test("Insights page renders KPIs and platform breakdown", async ({
    page,
  }) => {
    await page.goto("/posts/insights");
    await expect(
      page.getByRole("main").getByText(/Average score/i),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText(/Score by platform/i),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText(/Posting-hour heatmap/i),
    ).toBeVisible();
  });
});
