import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  ensureVault,
  error,
  handle,
  json,
  mutateWorkspace,
  readWorkspace,
  safeJson,
} from "./api";
import { createTask } from "./mutations";
import { silenceConsole, withTempVault } from "./test-utils";

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
    await silenceConsole(["error"], async () => {
      const res = await handle(async () => {
        throw new Error("kaboom");
      });
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: "kaboom" });
    });
  });

  it("handles non-Error thrown values as 500 with generic message", async () => {
    await silenceConsole(["error"], async () => {
      const res = await handle(async () => {
        throw "string-thrown";
      });
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: "Internal server error" });
    });
  });

  it("maps VaultCorruptError (non-VaultNotFoundError) to 500", async () => {
    class VaultCorruptError extends Error {
      constructor() {
        super("corrupt");
        this.name = "VaultCorruptError";
      }
    }
    await silenceConsole(["error"], async () => {
      const res = await handle(async () => {
        throw new VaultCorruptError();
      });
      // VaultCorruptError isn't specially handled, so it falls to 500.
      assert.equal(res.status, 500);
    });
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

  it("forwards 201 status with a body", async () => {
    const res = json({ ok: true }, { status: 201 });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { ok: true });
  });
});

describe("ensureVault", () => {
  it("returns ok=true when the vault exists", async () => {
    await withTempVault(async () => {
      const r = await ensureVault();
      assert.equal(r.ok, true);
    });
  });

  it("returns ok=false with a reason when the vault is missing", async () => {
    // init:false → temp dir with no workspace.json.
    await withTempVault(
      async () => {
        const r = await ensureVault();
        assert.equal(r.ok, false);
        assert.match(r.reason ?? "", /doodaboo init/);
      },
      { init: false },
    );
  });
});

describe("readWorkspace / mutateWorkspace", () => {
  it("readWorkspace returns the current state from disk", async () => {
    await withTempVault(async () => {
      const s = await readWorkspace();
      assert.ok(s.users.length > 0);
      assert.ok(s.projects.length > 0);
    });
  });

  it("mutateWorkspace returns the mutator's result and persists state", async () => {
    await withTempVault(async () => {
      const taskId = await mutateWorkspace((s) => {
        const r = createTask(s, {
          projectId: s.projects[0].id,
          title: "via mutateWorkspace",
        });
        return { state: r.state, result: r.task.id };
      });
      assert.match(taskId, /^t_/);
      const reloaded = await readWorkspace();
      assert.ok(reloaded.tasks.some((t) => t.id === taskId));
    });
  });

  it("mutateWorkspace persists changes across sequential calls", async () => {
    await withTempVault(async () => {
      const id1 = await mutateWorkspace((s) => {
        const r = createTask(s, {
          projectId: s.projects[0].id,
          title: "first",
        });
        return { state: r.state, result: r.task.id };
      });
      const id2 = await mutateWorkspace((s) => {
        const r = createTask(s, {
          projectId: s.projects[0].id,
          title: "second",
        });
        return { state: r.state, result: r.task.id };
      });
      const final = await readWorkspace();
      const titles = final.tasks
        .filter((t) => t.id === id1 || t.id === id2)
        .map((t) => t.title);
      assert.deepEqual(titles.sort(), ["first", "second"].sort());
    });
  });
});
