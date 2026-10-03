import { test, expect } from "@playwright/test";

/**
 * Cloud mode without a deployment (E2E_TARGET=cloud-offline).
 *
 * The build under test was made with NEXT_PUBLIC_CONVEX_URL pointing at a
 * port nothing listens on. That is enough to prove the parts of cloud mode
 * that do not need a server:
 *   - the gate: no workspace UI renders, the sign-in form does;
 *   - the device's local workspace (localStorage "doodaboo-v1") is never
 *     touched by a cloud session;
 *   - the connection banner appears once the deployment is unreachable;
 *   - its escape hatch switches the device to local mode and the app
 *     comes up with the local workspace.
 */
const isCloudOffline = process.env.E2E_TARGET === "cloud-offline";

test.describe("cloud mode, deployment unreachable", () => {
  test.skip(!isCloudOffline, "only meaningful against a cloud build (E2E_TARGET=cloud-offline)");

  test("gates on sign-in, leaves the local vault alone, offers the local escape hatch", async ({ page }) => {
    // A sentinel local workspace, as a previous local-mode session would
    // have left it.
    const sentinel = JSON.stringify({
      state: {
        version: 1,
        theme: "dark",
        currentUserId: "u_you",
        users: [{ id: "u_you", name: "Sentinel Owner", handle: "sentinel", color: "#ff5c1a" }],
        labels: [],
        projects: [
          {
            id: "p_sentinel",
            key: "SEN",
            name: "Sentinel Project",
            description: "",
            status: "todo",
            priority: "medium",
            memberIds: ["u_you"],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            nextTaskNumber: 1,
          },
        ],
        tasks: [],
        posts: [],
      },
      version: 0,
    });
    await page.goto("/");
    await page.evaluate((v) => {
      window.localStorage.clear();
      window.localStorage.setItem("doodaboo-v1", v);
    }, sentinel);
    await page.reload();

    // The gate: sign-in, and nothing workspace-shaped.
    await expect(page.getByRole("form", { name: /Sign in/i })).toBeVisible();
    await expect(page.getByRole("complementary", { name: /Primary navigation/i })).toHaveCount(0);
    await expect(page.getByText("Sentinel Project")).toHaveCount(0);

    // The banner appears after the first-connect grace period.
    await expect(page.getByTestId("connection-banner")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("connection-banner")).toContainText("127.0.0.1:9");

    // Nothing a cloud session does may touch the local vault.
    expect(await page.evaluate(() => window.localStorage.getItem("doodaboo-v1"))).toBe(sentinel);

    // Escape hatch: work locally on this device.
    await page.getByRole("button", { name: /Work locally on this device/i }).click();
    await expect(page.getByRole("complementary", { name: /Primary navigation/i })).toBeVisible();
    await expect(page.getByRole("complementary", { name: /Primary navigation/i }).getByText("Sentinel Project")).toBeVisible();
    // Local mode persists to the vault key again; the sentinel's theme wins
    // (the bootstrap reads it before React mounts).
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => window.localStorage.getItem("doodaboo-mode"))).toBe("local");
    // And the cloud-only pages explain themselves rather than breaking.
    await page.goto("/join?token=abc");
    await expect(page.getByText(/set to work locally/i)).toBeVisible();
  });

  test("the sign-up form enforces the password policy before anything is sent", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: /Create an account/i }).click();
    await expect(page.getByRole("form", { name: /Create account/i })).toBeVisible();
    await page.getByLabel("Email").fill("someone@example.com");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: /^Create account$/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /12-128/ })).toBeVisible();
  });
});
