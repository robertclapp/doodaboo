import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test.describe("Dashboard + global shell", () => {
  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  test("renders the dashboard with seed projects in the sidebar", async ({
    page,
  }) => {
    await expect(
      page.getByRole("link", { name: /Marketing Website/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Core Application/i }),
    ).toBeVisible();
  });

  test("Cmd+K opens the command palette and navigates to Posts", async ({
    page,
  }) => {
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByPlaceholder(/Type a command or search/i);
    await expect(palette).toBeVisible();
    await palette.fill("posts");
    await page.getByRole("button", { name: /^Go to Posts$/ }).click();
    await expect(page).toHaveURL(/\/posts$/);
  });

  test("? opens the keyboard shortcuts overlay", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(
      page.getByRole("dialog").getByText(/Keyboard shortcuts/i),
    ).toBeVisible();
  });

  test("Settings page exposes the theme switch", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dark" })).toBeVisible();
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
