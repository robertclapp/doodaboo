import { defineConfig } from "vitest/config";

/**
 * Vitest runs only the Convex backend tests (convex/**\/*.test.ts) against
 * convex-test's in-memory backend. The rest of the repo's unit tests use
 * node:test (see the `test` script) and must not be picked up here.
 */
export default defineConfig({
  test: {
    include: ["convex/**/*.test.ts"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
