import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

/**
 * Regression guards for composer fields whose stored shape differs from what
 * the user types. These are cheap to get wrong in a way unit tests can't see:
 * the bug is in the controlled-input round trip, not in the parsing.
 */
test.describe("Post composer field behavior", () => {
  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  test("hashtags field accepts separators so a second tag can be typed", async ({
    page,
  }) => {
    await page.goto("/posts/new");
    const tags = page.getByPlaceholder(/brutalism design indiehacker/i);
    await expect(tags).toBeVisible();

    // The store holds string[] while the input is a string, and the parse is
    // lossy — "design" and "design " both parse to ["design"]. Rendering the
    // joined array fed the old value back on the keystroke that typed the
    // separator, so the space vanished and a second tag was untypable.
    await tags.pressSequentially("design brutalism", { delay: 20 });
    await expect(tags).toHaveValue("design brutalism");

    // The parsed tags reach the model: the hint counts them.
    await expect(page.getByText(/^2 tags/)).toBeVisible();

    // A comma separator survives too.
    await tags.fill("");
    await tags.pressSequentially("one,two", { delay: 20 });
    await expect(tags).toHaveValue("one,two");
    await expect(page.getByText(/^2 tags/)).toBeVisible();
  });

  test("snapshot Minute advances after saving a snapshot", async ({ page }) => {
    await page.goto("/posts/new");
    await page.getByPlaceholder(/Working title/i).fill("Snapshot minute test");
    await page.getByRole("button", { name: /Mark live/i }).click();
    await expect(page).toHaveURL(/\/posts\/po_/);

    // Fresh post: the parent suggests T+5.
    const minute = page.getByLabel(/^Minute$/);
    await expect(minute).toHaveValue("5");

    await page.getByLabel(/^Views$/).fill("1000");
    await page.getByRole("button", { name: /Save snapshot/i }).click();
    await expect(page.getByText(/Snapshots · 1/i)).toBeVisible();

    // The parent recomputes the suggestion as min(60, last + 15). Before the
    // fix the field kept its mounted value, so the obvious next action filed
    // a duplicate snapshot at the same minute.
    await expect(minute).toHaveValue("20");
  });
});
