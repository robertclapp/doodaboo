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

  test("My Day list anchors the dashboard and Focus collapses everything else", async ({
    page,
  }) => {
    // My Day is the new ADHD-UX top-of-page surface: capped at 5, sorted
    // priority-then-due, scoped to MY_DAY_STATUSES. With seed data the
    // current user always owns at least one in-flight task.
    const myDay = page.getByRole("region", { name: "My Day" });
    await expect(myDay).toBeVisible();
    const focusButtons = myDay.getByRole("button", { name: /^Focus on/i });
    await expect(focusButtons.first()).toBeVisible();

    // Workload counters and the rest of the dashboard live below My Day
    // by default; Focus is what hides them.
    await expect(page.getByText(/Workload ·/)).toBeVisible();
    await expect(page.getByText(/Top posts/i)).toBeVisible();

    await focusButtons.first().click();

    // Focus mode: only the one task + escape hatch should be visible.
    await expect(
      page.getByRole("button", { name: /Show everything/i }),
    ).toBeVisible();
    await expect(page.getByText(/One thing at a time/i)).toBeVisible();
    await expect(page.getByText(/Workload ·/)).toHaveCount(0);
    await expect(page.getByText(/Top posts/i)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "My Day" })).toHaveCount(0);

    await page.getByRole("button", { name: /Show everything/i }).click();
    await expect(page.getByRole("region", { name: "My Day" })).toBeVisible();
    await expect(page.getByText(/Workload ·/)).toBeVisible();
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
