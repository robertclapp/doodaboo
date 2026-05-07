import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test.describe("Dashboard + global shell", () => {
  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  test("renders the dashboard with seed projects", async ({ page }) => {
    // Marketing Website appears in both the sidebar and the dashboard's
    // Projects panel; .first() picks whichever scope is on screen.
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

  test("? opens the keyboard shortcuts overlay", async ({ page }) => {
    // Shift+Slash on a US keyboard layout produces the "?" character; the
    // global keydown handler in AppShell matches on e.key === "?".
    await page.locator("body").focus();
    await page.keyboard.press("Shift+Slash");
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
