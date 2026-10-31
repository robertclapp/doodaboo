import { query } from "./_generated/server";

/**
 * Owner smoke test after the first deploy:
 *
 *   npx convex run health:crypto
 *
 * The pure mutation layer draws ids with nanoid, which needs Web Crypto in
 * the Convex runtime. Seeded ops (src/lib/ops.ts) avoid drawing on the
 * server in the common path, but the fallback must work too.
 */
export const crypto = query({
  args: {},
  handler: async () => ({
    getRandomValues: typeof globalThis.crypto?.getRandomValues === "function",
    now: new Date().toISOString(),
  }),
});
