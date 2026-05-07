import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test.describe("Playbooks", () => {
  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  test("library shows seed playbooks and filters by category", async ({
    page,
  }) => {
    await page.goto("/playbooks");
    await expect(
      page.getByRole("main").getByText(/3-second hook/i),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText(/X funnel/i),
    ).toBeVisible();

    await page.getByRole("button", { name: /^thread$/i }).click();
    await expect(
      page.getByRole("main").getByText(/X funnel/i),
    ).toBeVisible();
  });

  test("playbook detail surfaces hook + caption patterns", async ({
    page,
  }) => {
    await page.goto("/playbooks/pb_3s_hook");
    await expect(
      page.getByRole("main").getByText(/Hook pattern/i),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText(/Caption pattern/i),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText(/Configuration/i),
    ).toBeVisible();
  });

  test("apply-playbook modal previews score before/after", async ({
    page,
  }) => {
    await page.goto("/posts/po_brutalist_drop");
    await page
      .getByRole("button", { name: /Apply playbook|Playbook · /i })
      .first()
      .click();
    await expect(
      page.getByRole("dialog").getByText(/Apply a playbook/i),
    ).toBeVisible();

    // Pick the 3-second hook playbook.
    await page.getByRole("button", { name: /3-second hook/i }).click();
    await expect(
      page.getByRole("dialog").getByText(/Preview · 3-second hook/i),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText(/Before/i),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText(/After/i),
    ).toBeVisible();
  });
});
