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
    const titleInput = page.getByPlaceholder(/Working title/i);
    await titleInput.fill("E2E hook test");

    const gauge = page
      .getByRole("main")
      .locator("text=Intrinsic score")
      .locator("..");
    const valueLocator = gauge.locator("svg text").first();

    const initial = Number((await valueLocator.textContent()) ?? "0");

    await page
      .getByPlaceholder(/Stop scrolling/i)
      .fill("Stop using analytics dashboards. Try this 3-step routine.");
    // Wait a tick for the score to recompute.
    await page.waitForTimeout(150);

    const updated = Number((await valueLocator.textContent()) ?? "0");
    expect(updated).toBeGreaterThan(initial);
  });

  test("Hook Lab generates variants and spawns a draft", async ({ page }) => {
    await page.goto("/posts/lab");
    await page
      .getByPlaceholder(/pricing pages, ai onboarding/i)
      .fill("brutalist UI");

    // First "Use this" button on the first generated card.
    const firstUseBtn = page
      .getByRole("button", { name: /Use this/i })
      .first();
    await expect(firstUseBtn).toBeVisible();
    await firstUseBtn.click();

    await expect(page).toHaveURL(/\/posts\/po_/);
    await expect(
      page.getByRole("main").getByText(/Live blended score|Intrinsic score/i),
    ).toBeVisible();
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
    // The factor breakdown header shows up only when at least one lane is set.
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
