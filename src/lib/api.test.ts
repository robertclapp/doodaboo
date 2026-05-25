import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiError, error, handle, json, safeJson } from "./api";

describe("json", () => {
  it("returns 200 with no-store cache header by default", async () => {
    const res = json({ ok: true });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.match(res.headers.get("content-type") || "", /application\/json/);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("honors a custom status", async () => {
    const res = json({ ok: true }, { status: 201 });
    assert.equal(res.status, 201);
  });

  it("pretty-prints with 2-space indentation", async () => {
    const res = json({ a: 1, b: 2 });
    const text = await res.text();
    assert.match(text, /\n  /);
  });

  it("merges additional headers", () => {
    const res = json({}, { headers: { "x-custom": "1" } });
    assert.equal(res.headers.get("x-custom"), "1");
    assert.equal(res.headers.get("cache-control"), "no-store");
  });
});

describe("error", () => {
  it("wraps a message into { error } at the given status", async () => {
    const res = error(404, "not found");
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "not found" });
  });
});

describe("safeJson", () => {
  it("returns the parsed body for valid JSON", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "content-type": "application/json" },
    });
    const body = await safeJson<{ a: number }>(req);
    assert.equal(body.a, 1);
  });

  it("throws ApiError(400) for malformed JSON", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    await assert.rejects(
      () => safeJson(req),
      (err: any) => err instanceof ApiError && err.status === 400,
    );
  });
});

describe("ApiError", () => {
  it("carries the status code and message", () => {
    const e = new ApiError(403, "nope");
    assert.equal(e.status, 403);
    assert.equal(e.message, "nope");
    assert.equal(e.name, "ApiError");
  });
});

describe("handle", () => {
  it("passes through a successful Response", async () => {
    const res = await handle(async () => json({ ok: true }));
    assert.equal(res.status, 200);
  });

  it("maps ApiError to its status code", async () => {
    const res = await handle(async () => {
      throw new ApiError(422, "bad shape");
    });
    assert.equal(res.status, 422);
    assert.deepEqual(await res.json(), { error: "bad shape" });
  });

  it("maps VaultNotFoundError to 503", async () => {
    class VaultNotFoundError extends Error {
      constructor() {
        super("vault missing");
        this.name = "VaultNotFoundError";
      }
    }
    const res = await handle(async () => {
      throw new VaultNotFoundError();
    });
    assert.equal(res.status, 503);
  });

  it("falls through unknown errors as 500", async () => {
    // Suppress the expected error log.
    const origError = console.error;
    console.error = () => {};
    try {
      const res = await handle(async () => {
        throw new Error("kaboom");
      });
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: "kaboom" });
    } finally {
      console.error = origError;
    }
  });

  it("handles non-Error thrown values as 500 with generic message", async () => {
    const origError = console.error;
    console.error = () => {};
    try {
      const res = await handle(async () => {
        throw "string-thrown";
      });
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: "Internal server error" });
    } finally {
      console.error = origError;
    }
  });
});
