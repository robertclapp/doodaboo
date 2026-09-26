import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";
import { routes } from "../src/lib/routes";

/**
 * Web build only. Record pages moved from path ids (/posts/<id>) to a static
 * path plus id query (/posts/view?id=<id>) so the same URLs work in the Tauri
 * static export. Old bookmarks and external links keep working on the web
 * through 308 redirects declared in next.config.mjs.
 *
 * The redirect sources are regex-constrained on the id prefixes (po_, p_,
 * t_, pb_); the second half of this file proves the static routes that share
 * a parent directory (/posts/new, /posts/lab, …) are never caught. Next
 * ignores redirects() under output:'export', and nothing inside Tauri emits
 * an old-style URL, so there is nothing to test there.
 */
const isExport = process.env.E2E_TARGET === "export";

test.describe("Legacy path URLs redirect on the web", () => {
  test.skip(isExport, "redirects are a web-server feature; the export has none");

  test.beforeEach(async ({ page }) => {
    await resetWorkspace(page);
  });

  const cases: [string, string, RegExp][] = [
    ["/posts/po_brutalist_drop", routes.post("po_brutalist_drop"), /Snapshots ·/],
    ["/projects/p_web", routes.project("p_web"), /Redesign pricing page hero/],
    ["/projects/p_web/tasks/t_p_web_1", routes.task("t_p_web_1"), /Activity ·/],
    ["/playbooks/pb_3s_hook", routes.playbook("pb_3s_hook"), /3-second hook/i],
  ];

  for (const [legacy, current, renders] of cases) {
    test(`${legacy} → ${current}`, async ({ page }) => {
      // The raw hop: a permanent redirect pointing at the query-shaped URL.
      const hop = await page.request.get(legacy, { maxRedirects: 0 });
      expect(hop.status()).toBe(308);
      expect(hop.headers()["location"]).toContain(current);
      // And following it lands on a page that actually renders the record.
      await page.goto(legacy);
      await expect(page).toHaveURL(new RegExp(current.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      await expect(page.getByText(renders).first()).toBeVisible();
    });
  }

  test("static routes sharing a parent with id routes are not redirected", async ({ page }) => {
    for (const url of [routes.newPost, routes.lab, routes.insights, routes.newProject, routes.compare()]) {
      await page.goto(url);
      await expect(page, `${url} must not redirect`).toHaveURL(new RegExp(`${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    }
    // And the new view paths themselves must be reachable directly.
    await page.goto(routes.post("po_brutalist_drop"));
    await expect(page).toHaveURL(/\/posts\/view\?id=po_brutalist_drop$/);
  });
});
