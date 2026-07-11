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

  test("task edits write through the store and survive an immediate reload", async ({
    page,
  }) => {
    // Regression guard for the store-controlled task detail: title and
    // description persist per keystroke — no debounce window, no local
    // mirror to flush — so closing the tab mid-thought can't lose text.
    await page
      .getByRole("link", { name: /Marketing Website/i })
      .first()
      .click();
    await page
      .getByRole("main")
      .getByText("Redesign pricing page hero")
      .click();
    await expect(page).toHaveURL(/\/tasks\/t_/);

    // Textboxes on the task page, in order: title input, description
    // textarea, new-comment textarea.
    const title = page.getByRole("textbox").first();
    const description = page.getByRole("textbox").nth(1);
    await title.fill("Redesign pricing page hero v2");
    await description.fill("E2E write-through description");

    // Reload immediately — an autosave debounce would drop these edits.
    await page.reload();
    await expect(page.getByRole("textbox").first()).toHaveValue(
      "Redesign pricing page hero v2",
    );
    await expect(page.getByRole("textbox").nth(1)).toHaveValue(
      "E2E write-through description",
    );
  });

  test("kanban board lists every status column", async ({ page }) => {
    await page
      .getByRole("link", { name: /Marketing Website/i })
      .first()
      .click();
    await page.getByRole("button", { name: /^Board$/i }).click();
    // Scope to the kanban column headers via testid so the Status filter
    // dropdown's <option> elements (which match the same labels but are
    // hidden) don't satisfy the locator.
    const headers = page.getByTestId("kanban-column-header");
    await expect(headers).toHaveCount(6);
    for (const label of [
      "Backlog",
      "Todo",
      "In Progress",
      "In Review",
      "Done",
      "Cancelled",
    ]) {
      // Substring match is enough — every status label is unique among the
      // six columns, so there's no risk of one matching another's header.
      await expect(headers.filter({ hasText: label })).toBeVisible();
    }
  });
});
