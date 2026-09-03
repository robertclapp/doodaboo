import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeApiRequest,
  bearerToken,
  constantTimeEquals,
  isOpenPath,
  OPEN_API_PATHS,
} from "./api-auth";

const req = (over: Partial<Parameters<typeof authorizeApiRequest>[0]> = {}) =>
  authorizeApiRequest({
    pathname: "/api/workspace",
    authorization: null,
    token: undefined,
    isProduction: false,
    ...over,
  });

describe("isOpenPath", () => {
  it("keeps the healthcheck reachable without credentials", () => {
    // railway.json points its healthcheck here; a deploy that 401s its own
    // healthcheck never goes live.
    assert.ok(isOpenPath("/api/health"));
    assert.ok(isOpenPath("/api/health/"));
  });

  it("does not open anything else", () => {
    for (const p of [
      "/api/workspace",
      "/api/posts",
      "/api/tasks/t_1",
      "/api/healthz",
      "/api/health/secrets",
    ]) {
      assert.equal(isOpenPath(p), false, `${p} must not be open`);
    }
  });

  it("only lists paths that expose no workspace data", () => {
    assert.deepEqual([...OPEN_API_PATHS], ["/api/health"]);
  });
});

describe("bearerToken", () => {
  it("extracts the credential case-insensitively", () => {
    assert.equal(bearerToken("Bearer abc123"), "abc123");
    assert.equal(bearerToken("bearer abc123"), "abc123");
    assert.equal(bearerToken("BEARER   abc123  "), "abc123");
  });

  it("returns undefined for absent or non-bearer schemes", () => {
    assert.equal(bearerToken(null), undefined);
    assert.equal(bearerToken(""), undefined);
    assert.equal(bearerToken("Basic abc123"), undefined);
    assert.equal(bearerToken("Bearer"), undefined);
    assert.equal(bearerToken("Bearer   "), undefined);
  });
});

describe("authorizeApiRequest — token configured", () => {
  const token = "s3cret-token";

  it("accepts the matching bearer token", () => {
    assert.deepEqual(
      req({ token, authorization: `Bearer ${token}` }),
      { ok: true },
    );
  });

  it("rejects a missing Authorization header with 401", () => {
    const d = req({ token });
    assert.equal(d.ok, false);
    assert.equal(d.ok === false && d.status, 401);
  });

  it("rejects a wrong token with 401", () => {
    const d = req({ token, authorization: "Bearer nope" });
    assert.equal(d.ok, false);
    assert.equal(d.ok === false && d.status, 401);
  });

  it("still lets the healthcheck through", () => {
    assert.deepEqual(req({ token, pathname: "/api/health" }), { ok: true });
  });

  it("applies in development too once a token is set", () => {
    const d = req({ token, isProduction: false });
    assert.equal(d.ok, false);
  });
});

describe("authorizeApiRequest — token unset", () => {
  it("stays open in development so local dev and tests work", () => {
    assert.deepEqual(req({ isProduction: false }), { ok: true });
  });

  it("fails closed in production rather than serving the vault openly", () => {
    const d = req({ isProduction: true });
    assert.equal(d.ok, false);
    assert.equal(d.ok === false && d.status, 503);
    // The message must say how to fix it, not just refuse.
    assert.match(
      d.ok === false ? d.message : "",
      /DOODABOO_API_TOKEN/,
    );
  });

  it("treats an empty or whitespace token as unset", () => {
    assert.equal(req({ token: "", isProduction: true }).ok, false);
    assert.equal(req({ token: "   ", isProduction: true }).ok, false);
  });

  it("keeps the healthcheck up even when unconfigured in production", () => {
    // Otherwise an unconfigured deploy could never pass its healthcheck to
    // report that it is unconfigured.
    assert.deepEqual(
      req({ isProduction: true, pathname: "/api/health" }),
      { ok: true },
    );
  });
});

describe("constantTimeEquals", () => {
  it("matches === for equality outcomes", () => {
    const cases: [string, string][] = [
      ["", ""],
      ["a", "a"],
      ["abc", "abc"],
      ["abc", "abd"],
      ["abc", "ab"],
      ["ab", "abc"],
      ["", "a"],
      ["a", ""],
      ["long-token-value", "long-token-value"],
      ["long-token-value", "long-token-valuf"],
    ];
    for (const [a, b] of cases) {
      assert.equal(
        constantTimeEquals(a, b),
        a === b,
        `constantTimeEquals(${JSON.stringify(a)}, ${JSON.stringify(b)})`,
      );
    }
  });

  it("does not short-circuit on the first differing character", () => {
    // A plain === leaks how much of a guess was right via response time. The
    // loop must run the same number of iterations whether the mismatch is at
    // the start or the end, so both of these do identical work.
    const secret = "x".repeat(64);
    const differsFirst = "y" + "x".repeat(63);
    const differsLast = "x".repeat(63) + "y";
    assert.equal(constantTimeEquals(secret, differsFirst), false);
    assert.equal(constantTimeEquals(secret, differsLast), false);
  });
});
