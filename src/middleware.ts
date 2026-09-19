import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authorizeApiRequest } from "@/lib/api-auth";

/**
 * Single choke point for HTTP API authorization.
 *
 * Deliberately middleware rather than a per-route guard: route handlers here
 * don't take a uniform signature (several `GET`s accept no request at all), so
 * a per-route check would be easy to forget on the next route added. Matching
 * `/api/:path*` means a new route is protected by default.
 *
 * The policy itself lives in src/lib/api-auth.ts so it can be unit-tested;
 * this only supplies the request and environment.
 */
export function middleware(req: NextRequest): NextResponse {
  const decision = authorizeApiRequest({
    pathname: req.nextUrl.pathname,
    authorization: req.headers.get("authorization"),
    token: process.env.DOODABOO_API_TOKEN,
    isProduction: process.env.NODE_ENV === "production",
  });

  if (decision.ok) return NextResponse.next();

  return NextResponse.json(
    { error: decision.message },
    {
      status: decision.status,
      headers: {
        "cache-control": "no-store",
        // Tell a client how to authenticate rather than leaving it guessing.
        ...(decision.status === 401
          ? { "www-authenticate": 'Bearer realm="doodaboo"' }
          : {}),
      },
    },
  );
}

export const config = {
  matcher: "/api/:path*",
};
