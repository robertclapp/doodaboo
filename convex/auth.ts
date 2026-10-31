import { ConvexError } from "convex/values";
import { convexAuth, retrieveAccount } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import {
  ConvexCredentials,
  type ConvexCredentialsUserConfig,
} from "@convex-dev/auth/providers/ConvexCredentials";
import type { DataModel } from "./_generated/dataModel";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Lower-cased, trimmed, shape-checked. Everything that compares emails uses this. */
export function normalizeEmail(raw: unknown): string {
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    throw new ConvexError("Enter a valid email address");
  }
  return email;
}

export function validatePassword(password: unknown, email?: string): void {
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new ConvexError(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);
  }
  if (email && password.toLowerCase() === email) {
    throw new ConvexError("Password must not be your email address");
  }
}

/**
 * Email + password, with three hardenings over the stock provider:
 *   - the email is normalized before it becomes the account id, so
 *     `Bob@X.com` and `bob@x.com` are one account and sign in either way;
 *   - passwords are 12–128 characters (the default is 8 with no maximum,
 *     and Scrypt is billed per action);
 *   - `flow: "signUp"` on an existing account is refused before the
 *     stock code path can verify the supplied password against it. Without
 *     this, sign-up doubles as an unlimited password oracle, because the
 *     failed-attempt rate limit only counts the `signIn` flow.
 */
const password = Password<DataModel>({
  profile(params) {
    const email = normalizeEmail(params.email);
    const name =
      typeof params.name === "string" && params.name.trim()
        ? params.name.trim().slice(0, 80)
        : email.split("@")[0].slice(0, 80);
    return { email, name };
  },
  validatePasswordRequirements(password) {
    validatePassword(password);
  },
});

// `ConvexCredentials()` (which `Password()` wraps) returns an Auth.js-style
// provider whose top-level `authorize` is a stub; the real implementation,
// crypto and extra providers live under `.options` and are merged in when
// the config is materialized. Reach for those, not the stub.
const stock = (password as unknown as { options: ConvexCredentialsUserConfig<DataModel> }).options;

const hardenedPassword = ConvexCredentials<DataModel>({
  id: "password",
  crypto: stock.crypto,
  extraProviders: stock.extraProviders,
  async authorize(params, ctx) {
    const flow = params.flow;
    if (flow === "signUp") {
      const email = normalizeEmail(params.email);
      validatePassword(params.password, email);
      let exists = false;
      try {
        await retrieveAccount(ctx, { provider: "password", account: { id: email } });
        exists = true;
      } catch {
        // "InvalidAccountId": no such account, which is what sign-up needs.
      }
      if (exists) throw new ConvexError("Could not sign up with that email");
      return stock.authorize({ ...params, email }, ctx);
    }
    if (flow === "signIn") {
      const email = normalizeEmail(params.email);
      try {
        return await stock.authorize({ ...params, email }, ctx);
      } catch (err) {
        throw signInError(err);
      }
    }
    // Reset / verification flows are not configured (no email provider);
    // the stock implementation rejects them with a clear error.
    return stock.authorize(params, ctx);
  },
});

/**
 * The stock provider signals a failed sign-in with plain Errors carrying a
 * code ("InvalidAccountId", "InvalidSecret", "TooManyFailedAttempts",
 * "Invalid credentials"). Production deployments redact plain Errors, so the
 * user would see a raw "Server Error"; ConvexError data always reaches the
 * client. An unknown email and a wrong password get the same message.
 */
export function signInError(err: unknown): unknown {
  if (err instanceof ConvexError) return err;
  const code = err instanceof Error ? err.message : String(err);
  if (code.includes("TooManyFailedAttempts")) {
    return new ConvexError("Too many failed sign-in attempts. Wait a while and try again.");
  }
  if (code.includes("InvalidAccountId") || code.includes("InvalidSecret") || code.includes("Invalid credentials")) {
    return new ConvexError("Wrong email or password");
  }
  return err;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [hardenedPassword],
});
