import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";
import { routes } from "../src/lib/routes";

/**
 * Runs only against the Tauri static export, served through a faithful copy
 * of Tauri's asset-resolver fallback chain (scripts/serve-export.mjs):
 *
 *   path -> path.html -> path/index.html -> index.html
 *
 * Under that chain, any request for a page that does not exist as a file
 * comes back as the root index.html — so the failure mode this guards is not
 * a 404 but the *dashboard rendering at the wrong URL*. That is exactly what
 * happened with path-segment ids (/posts/<id>), and why record pages moved to
 * a static path plus id query. Each case below replays a scenario from the
 * original probe.
 */
const isExport = process.env.E2E_TARGET === "export";

test.describe("Tauri static export — record pages resolve under the asset fallback", () => {
  test.skip(!isExport, "only meaningful against the static export (E2E_TARGET=export)");

  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  test("client-side navigation to a post renders the post, not the dashboard", async ({ page }) => {
    // The router's RSC fetch for the destination must find a real file; if it
    // fell through to index.html the dashboard would paint under the post URL.
    const rscFallbacks: string[] = [];
    page.on("response", (res) => {
      const url = new URL(res.url());
      const type = res.headers()["content-type"] ?? "";
      if (url.pathname.endsWith(".txt") && type.includes("text/html")) rscFallbacks.push(url.pathname);
    });

    await page.goto(routes.posts);
    await page.getByRole("main").getByText(/Brutalist drop teaser/i).first().click();

    await expect(page).toHaveURL(/\/posts\/view\?id=po_brutalist_drop/);
    await expect(page.getByText(/Snapshots ·/)).toBeVisible();
    await expect(page.getByRole("main").getByText(/My Day/)).toHaveCount(0);
    expect(rscFallbacks, "RSC payload fetches that fell back to index.html").toEqual([]);
  });

  test("a hard load of a post URL renders the post", async ({ page }) => {
    await page.goto(routes.post("po_brutalist_drop"));
    await expect(page.getByText(/Snapshots ·/)).toBeVisible();
    await expect(page.getByRole("main").getByText(/My Day/)).toHaveCount(0);
  });

  test("a hard load of a task URL renders the task inside its project", async ({ page }) => {
    await page.goto(routes.task("t_p_web_1"));
    await expect(page.getByRole("textbox").first()).toHaveValue(/Redesign pricing page hero/);
    // The back-link is derived from the task's own project.
    await expect(page.getByRole("link", { name: /WEB-1/ })).toHaveAttribute("href", routes.project("p_web"));
  });

  test("a hard load of a project URL renders the project", async ({ page }) => {
    await page.goto(routes.project("p_web"));
    await expect(page.getByRole("main").getByText("Marketing Website").first()).toBeVisible();
    await expect(page.getByRole("main").getByText("Redesign pricing page hero")).toBeVisible();
  });

  test("a hard load of a playbook URL renders the playbook", async ({ page }) => {
    await page.goto(routes.playbook("pb_3s_hook"));
    await expect(page.getByRole("main").getByText(/3-second hook/i).first()).toBeVisible();
  });

  test("an unknown id renders the page's own not-found state, never the dashboard", async ({ page }) => {
    await page.goto(routes.post("po_does_not_exist"));
    await expect(page.getByText(/Post not found/i)).toBeVisible();
    await expect(page.getByRole("main").getByText(/My Day/)).toHaveCount(0);
  });

  test("the sidebar highlights the project of the current task", async ({ page }) => {
    await page.goto(routes.task("t_p_web_1"));
    const nav = page.getByRole("complementary", { name: /Primary navigation/i });
    const active = nav.getByRole("link", { name: /Marketing Website/i });
    await expect(active).toHaveClass(/bg-ink/);
  });
});
