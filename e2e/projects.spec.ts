import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test.describe("Projects + tasks", () => {
  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  test("creates a project end to end", async ({ page }) => {
    await page.goto("/projects/new");
    await page
      .getByPlaceholder(/Marketing Website/i)
      .fill("E2E Project");
    await expect(
      page.getByText(/Preview: E2EP-1, E2EP-2/i),
    ).toBeVisible();
    await page.getByRole("button", { name: /Create Project/i }).click();
    // Project detail should render with the project name in the header.
    await expect(page).toHaveURL(/\/projects\/p_/);
    await expect(
      page.getByRole("main").getByText("E2E Project").first(),
    ).toBeVisible();
  });

  test("opens a seed project and creates an issue via the c shortcut", async ({
    page,
  }) => {
    // Project links exist in both the sidebar and the dashboard's Projects
    // panel; either path navigates to the same place.
    await page
      .getByRole("link", { name: /Marketing Website/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/projects\/p_web/);

    await page.locator("body").press("c");
    const titleInput = page.getByPlaceholder(/Describe the work in one line/i);
    await expect(titleInput).toBeVisible();
    await titleInput.fill("E2E created issue");
    await page.getByRole("button", { name: /^Create$/ }).click();
    await expect(
      page.getByRole("main").getByText("E2E created issue"),
    ).toBeVisible();
  });

  test("kanban board lists every status column", async ({ page }) => {
    await page
      .getByRole("link", { name: /Marketing Website/i })
      .first()
      .click();
    await page.getByRole("button", { name: /^Board$/i }).click();
    for (const label of [
      "Backlog",
      "Todo",
      "In Progress",
      "In Review",
      "Done",
      "Cancelled",
    ]) {
      await expect(
        page
          .getByRole("main")
          .getByText(new RegExp(`^${label}$`, "i"))
          .first(),
      ).toBeVisible();
    }
  });
});
