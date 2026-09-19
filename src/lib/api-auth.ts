/**
 * Authorization policy for the HTTP API.
 *
 * The web app is localStorage-first and never calls these routes — the API
 * exists for integrations, the CLI, and the desktop app's bundled server. That
 * means requiring a token here cannot break the browser UI, and it closes a
 * real hole: a deployment with a persistent vault volume (see docs/desktop.md
 * and railway.json) otherwise lets anyone with the URL read the whole
 * workspace via `GET /api/workspace` or overwrite it with `PUT`.
 *
 * Policy:
 *   - `/api/health` is always open. Railway's healthcheck (railway.json
 *     `healthcheckPath`) cannot present a token, and a deploy that 401s its
 *     own healthcheck never goes live. It deliberately exposes no workspace
 *     data.
 *   - With DOODABOO_API_TOKEN set, every other route requires
 *     `Authorization: Bearer <token>`.
 *   - With it unset, the API stays open in development (local dev, tests, and
 *     `doodaboo serve` against your own vault) but is refused in production.
 *     Failing closed matters more than convenience once the process is
 *     listening on a public URL, and the failure is loud and self-describing
 *     rather than a silent open door.
 *
 * This module is pure so the policy is unit-testable; `src/middleware.ts` is a
 * thin wrapper that supplies the request and environment.
 */

export const OPEN_API_PATHS = ["/api/health"] as const;

export type AuthDecision =
  | { ok: true }
  | { ok: false; status: number; message: string };

export interface AuthInput {
  /** Request pathname, e.g. "/api/workspace". */
  pathname: string;
  /** Raw Authorization header, if any. */
  authorization: string | null;
  /** Configured token (DOODABOO_API_TOKEN); undefined/empty means unset. */
  token: string | undefined;
  /** Whether this process is running as a production deployment. */
  isProduction: boolean;
}

/** True for routes that must stay reachable without credentials. */
export function isOpenPath(pathname: string): boolean {
  // Normalize a trailing slash so "/api/health/" matches too.
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (OPEN_API_PATHS as readonly string[]).includes(p);
}

/** Extract the credential from an `Authorization: Bearer <token>` header. */
export function bearerToken(authorization: string | null): string | undefined {
  if (!authorization) return undefined;
  const match = /^Bearer[ \t]+(.+)$/i.exec(authorization.trim());
  return match ? match[1].trim() : undefined;
}

export function authorizeApiRequest(input: AuthInput): AuthDecision {
  if (isOpenPath(input.pathname)) return { ok: true };

  const configured = input.token?.trim();
  if (!configured) {
    if (!input.isProduction) return { ok: true };
    return {
      ok: false,
      status: 503,
      message:
        "API is not configured for authenticated access. Set DOODABOO_API_TOKEN on this deployment to enable the HTTP API.",
    };
  }

  const presented = bearerToken(input.authorization);
  if (!presented) {
    return {
      ok: false,
      status: 401,
      message: "Missing bearer token. Send `Authorization: Bearer <token>`.",
    };
  }
  return constantTimeEquals(presented, configured)
    ? { ok: true }
    : { ok: false, status: 401, message: "Invalid API token." };
}

/**
 * Compare two secrets without short-circuiting on the first differing byte.
 *
 * A plain `===` returns as soon as it finds a mismatch, so response time leaks
 * how much of a guessed token was correct. This walks a fixed span instead and
 * folds any length difference into the same accumulator, so neither the
 * position of the first difference nor the length ends the loop early.
 *
 * Implemented with charCodeAt rather than node:crypto's timingSafeEqual so it
 * runs unchanged on the edge runtime, where middleware executes.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const span = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < span; i++) {
    // Past the end charCodeAt is NaN; `|| 0` keeps the XOR well-defined.
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
