import { convexTest, type TestConvex } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { Seed } from "../src/lib/ops";

/**
 * Helpers for convex/*.test.ts.
 *
 * Identity: Convex Auth encodes `userId|sessionId` in the JWT `sub` claim
 * and `getAuthUserId` splits on the `|`, so `t.withIdentity({ subject })`
 * with that shape is exactly what a signed-in caller looks like.
 */

export type T = TestConvex<typeof schema>;

export function fresh(): T {
  return convexTest(schema);
}

export interface Account {
  userId: Id<"users">;
  sessionId: Id<"authSessions">;
  email: string;
}

function decodeSubject(token: string): string {
  const payload = token.split(".")[1];
  const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return (JSON.parse(json) as { sub: string }).sub;
}

/** Run the real Password sign-up flow and return the new account. */
export async function signUp(t: T, email: string, password = "correct horse battery", name?: string): Promise<Account> {
  const res = (await t.action(api.auth.signIn, {
    provider: "password",
    params: { flow: "signUp", email, password, ...(name ? { name } : {}) },
  })) as { tokens?: { token: string } | null };
  if (!res.tokens?.token) throw new Error("signUp did not return tokens");
  const [userId, sessionId] = decodeSubject(res.tokens.token).split("|");
  return { userId: userId as Id<"users">, sessionId: sessionId as Id<"authSessions">, email: email.toLowerCase() };
}

/** Act as a signed-in account. */
export function as(t: T, account: Pick<Account, "userId" | "sessionId">) {
  return t.withIdentity({ subject: `${account.userId}|${account.sessionId}` });
}

let counter = 0;
/** A deterministic seed for ops: distinct ids per call, fixed clock. */
export function seed(now = new Date().toISOString()): Seed {
  counter++;
  return {
    ids: Array.from({ length: 6 }, (_, i) => `s${counter.toString(36)}x${i}`),
    now,
  };
}

/** Create a workspace owned by `account` and return its id. */
export async function workspaceFor(t: T, account: Account, name = "Test workspace"): Promise<Id<"workspaces">> {
  return (await as(t, account).mutation(api.workspace.create, { name })) as Id<"workspaces">;
}
