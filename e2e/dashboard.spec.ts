import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test.describe("Dashboard + global shell", () => {
  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  test("renders the dashboard with seed projects", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /Marketing Website/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Core Application/i }).first(),
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

  test("sidebar shortcuts link opens the keyboard shortcuts overlay", async ({
    page,
  }) => {
    // The sidebar exposes the same shortcuts dialog the `?` keypress
    // does, but click-driven activation is more deterministic in CI than
    // dispatching a synthetic keyboard event with no focused target.
    await page.getByRole("button", { name: /shortcuts/i }).click();
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
