import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT ?? "3100";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

/**
 * Playwright config — run against a production build of the app so we
 * exercise the same code path Vercel will serve. The web server line
 * is skipped when E2E_BASE_URL points at an already-running server,
 * which is how preview deployments and local dev runs are wired.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [["github"], ["list"], ["json", { outputFile: "playwright-results.json" }]]
    : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start --port ${PORT}`,
        port: Number(PORT),
        reuseExistingServer: !isCI,
        timeout: 120_000,
        env: {
          NODE_ENV: "production",
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
});
