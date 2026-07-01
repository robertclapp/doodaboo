import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test.describe("Settings workspace lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  test("start blank wipes to a single-owner empty workspace and reset restores the demo", async ({
    page,
  }) => {
    await page.goto("/settings");

    // Seeded workspace has demo content.
    await expect(page.getByTestId("stat-projects")).not.toHaveText("0");

    await page.getByRole("button", { name: /Start blank/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Start blank$/i }).click();

    await expect(page.getByText("Started a blank workspace")).toBeVisible();
    await expect(page.getByTestId("stat-projects")).toHaveText("0");
    await expect(page.getByTestId("stat-issues")).toHaveText("0");
    await expect(page.getByTestId("stat-labels")).toHaveText("0");
    // One owner account remains so pickers and "assigned to me" keep working.
    await expect(page.getByTestId("stat-members")).toHaveText("1");

    // The blank state persists across reload.
    await page.reload();
    await expect(page.getByTestId("stat-projects")).toHaveText("0");

    // Demo posts are gone from the Posts surface too.
    await page.goto("/posts");
    await expect(
      page.getByRole("main").getByText(/Brutalist drop teaser/i),
    ).toHaveCount(0);

    // Reset to seed brings the demo workspace back.
    await page.goto("/settings");
    await page.getByRole("button", { name: /Reset workspace/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Reset to seed/i })
      .click();
    await expect(page.getByTestId("stat-projects")).not.toHaveText("0");
    await expect(page.getByTestId("stat-members")).not.toHaveText("1");
  });
});
