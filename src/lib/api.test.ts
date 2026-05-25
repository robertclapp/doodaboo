import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApiError, ensureVault, error, handle, json, safeJson } from "./api";
import { initVault } from "./vault";

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
    class VaultCorruptError extends Error {
      constructor() {
        super("corrupt");
        this.name = "VaultCorruptError";
      }
    }
    const origError = console.error;
    console.error = () => {};
    try {
      const res = await handle(async () => {
        throw new VaultCorruptError();
      });
      // VaultCorruptError isn't specially handled, so it falls to 500.
      assert.equal(res.status, 500);
    } finally {
      console.error = origError;
    }
  });

  it("preserves the 503 message from VaultNotFoundError", async () => {
    class VaultNotFoundError extends Error {
      constructor() {
        super("vault missing at /tmp/x");
        this.name = "VaultNotFoundError";
      }
    }
    const res = await handle(async () => {
      throw new VaultNotFoundError();
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as any;
    assert.equal(body.error, "vault missing at /tmp/x");
  });
});

describe("json — serialization shapes", () => {
  it("serializes null body", async () => {
    const res = json(null);
    assert.equal(await res.text(), "null");
  });

  it("serializes arrays", async () => {
    const res = json([1, 2, 3]);
    assert.deepEqual(await res.json(), [1, 2, 3]);
  });
});

// ── ensureVault ────────────────────────────────────────────────────────────

describe("ensureVault", () => {
  let prevVault: string | undefined;
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "doodaboo-api-ensure-"));
    prevVault = process.env.DOODABOO_VAULT;
  });

  afterEach(async () => {
    if (prevVault === undefined) delete process.env.DOODABOO_VAULT;
    else process.env.DOODABOO_VAULT = prevVault;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("returns ok=true when the vault exists", async () => {
    await initVault(tmp, { force: true });
    process.env.DOODABOO_VAULT = tmp;
    const result = await ensureVault();
    assert.equal(result.ok, true);
    assert.equal(result.reason, undefined);
  });

  it("returns ok=false with a reason when the vault is missing", async () => {
    process.env.DOODABOO_VAULT = path.join(tmp, "nonexistent");
    const result = await ensureVault();
    assert.equal(result.ok, false);
    assert.ok(typeof result.reason === "string" && result.reason.length > 0);
    assert.match(result.reason!, /doodaboo init/);
  });
});

// ── handle — additional error shapes ─────────────────────────────────────

describe("handle — additional branches", () => {
  it("maps VaultNotFoundError by name (not instanceof) to 503", async () => {
    // The handler checks err.name === 'VaultNotFoundError' — ensure it
    // also works when the class is re-created in a different module scope.
    const err = new Error("vault gone");
    err.name = "VaultNotFoundError";
    const res = await handle(async () => {
      throw err;
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as any;
    assert.equal(body.error, "vault gone");
  });

  it("returns 200 for a void-returning handler wrapped in json()", async () => {
    const res = await handle(async () => json({ data: "ok" }, { status: 200 }));
    assert.equal(res.status, 200);
  });

  it("ApiError with status 400 produces 400 response", async () => {
    const res = await handle(async () => {
      throw new ApiError(400, "bad request");
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error, "bad request");
  });
});

// ── error helper ─────────────────────────────────────────────────────────

describe("error — additional statuses", () => {
  it("produces 503 with correct body", async () => {
    const res = error(503, "unavailable");
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "unavailable" });
  });

  it("produces 201 with body (status forwarding)", async () => {
    const res = error(201, "created");
    assert.equal(res.status, 201);
  });
});

// ── safeJson — content-type independence ─────────────────────────────────

describe("safeJson — additional shapes", () => {
  it("parses arrays as T", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify([1, 2, 3]),
    });
    const result = await safeJson<number[]>(req);
    assert.deepEqual(result, [1, 2, 3]);
  });

  it("parses null body as null", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: "null",
    });
    const result = await safeJson<null>(req);
    assert.equal(result, null);
  });
});
