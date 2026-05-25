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

  it("maps VaultCorruptError (non-VaultNotFoundError) to 500", async () => {
    // VaultCorruptError does NOT have name=VaultNotFoundError, so it
    // falls through to the generic 500 path.
    class VaultCorruptError extends Error {
      constructor() {
        super("workspace.json is corrupt");
        this.name = "VaultCorruptError";
      }
    }
    const origError = console.error;
    console.error = () => {};
    try {
      const res = await handle(async () => {
        throw new VaultCorruptError();
      });
      assert.equal(res.status, 500);
      const body = (await res.json()) as any;
      assert.match(body.error, /corrupt/);
    } finally {
      console.error = origError;
    }
  });

  it("preserves the 503 message from VaultNotFoundError", async () => {
    class VaultNotFoundError extends Error {
      constructor() {
        super("No vault at /some/path. Run `doodaboo init` to create one.");
        this.name = "VaultNotFoundError";
      }
    }
    const res = await handle(async () => {
      throw new VaultNotFoundError();
    });
    const body = (await res.json()) as any;
    assert.match(body.error, /vault/i);
  });
});

// ── Additional json / error helpers ──────────────────────────────────────

describe("json — additional cases", () => {
  it("serializes null body", async () => {
    const res = json(null);
    assert.equal(res.status, 200);
    assert.equal(await res.json(), null);
  });

  it("serializes arrays", async () => {
    const res = json([1, 2, 3]);
    const body = await res.json();
    assert.deepEqual(body, [1, 2, 3]);
  });

  it("status 204 has no body issue (sets status correctly)", () => {
    const res = json({}, { status: 204 });
    assert.equal(res.status, 204);
  });
});

describe("error — additional cases", () => {
  it("500 error body contains the error key", async () => {
    const res = error(500, "oops");
    assert.equal(res.status, 500);
    const body = (await res.json()) as any;
    assert.equal(body.error, "oops");
  });

  it("400 error with empty message", async () => {
    const res = error(400, "");
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error, "");
  });
});

describe("safeJson — additional cases", () => {
  it("handles JSON arrays correctly", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify([1, 2, 3]),
      headers: { "content-type": "application/json" },
    });
    const body = await safeJson<number[]>(req);
    assert.deepEqual(body, [1, 2, 3]);
  });

  it("handles empty JSON object", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    const body = await safeJson<Record<string, never>>(req);
    assert.deepEqual(body, {});
  });
});

describe("ApiError — additional cases", () => {
  it("is an instance of Error", () => {
    assert.ok(new ApiError(500, "x") instanceof Error);
  });

  it("different statuses are stored correctly", () => {
    for (const code of [400, 401, 403, 404, 422, 500, 503]) {
      const e = new ApiError(code, `status ${code}`);
      assert.equal(e.status, code);
    }
  });
});
