import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { toUser } from "./lib";

/** The signed-in account, or null. The only place the caller's email is returned. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const doc = await ctx.db.get(userId);
    if (!doc) return null;
    return { ...toUser(doc), email: doc.email ?? null, title: doc.title ?? null };
  },
});
