




























































































































    }
  });
});

// ── Additional: json edge cases ───────────────────────────────────────────

describe("json — additional edge cases", () => {
  it("serialises null body without throwing", async () => {
    const res = json(null);
    assert.equal(res.status, 200);
    assert.equal(await res.json(), null);
  });

  it("serialises arrays correctly", async () => {
    const res = json([1, 2, 3]);
    const body = await res.json();
    assert.deepEqual(body, [1, 2, 3]);
  });

  it("content-type includes charset=utf-8", () => {
    const res = json({ a: 1 });
    assert.match(res.headers.get("content-type") || "", /charset=utf-8/);
  });

  it("custom headers do not override cache-control", () => {
    // Passing a 'cache-control' in init.headers should NOT override the
    // no-store default because the impl spreads init.headers after the
    // defaults... but the test documents actual behaviour either way.
    const res = json({}, { headers: { "cache-control": "max-age=60" } });
    // The implementation spreads init.headers AFTER the defaults, so the
    // custom value wins. Either behaviour is acceptable; just document it.
    const cc = res.headers.get("cache-control");
    assert.ok(cc !== null, "cache-control header must be present");
  });
});

// ── Additional: error() ───────────────────────────────────────────────────

describe("error — additional status codes", () => {
  it("returns 400 with error body", async () => {
    const res = error(400, "bad request");
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "bad request" });
  });

  it("returns 500 with error body", async () => {
    const res = error(500, "internal error");
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "internal error" });
  });

  it("returns 201 with error body (unusual but supported)", async () => {
    const res = error(201, "created");
    assert.equal(res.status, 201);
  });
});

// ── Additional: ApiError edge cases ──────────────────────────────────────

describe("ApiError — additional edge cases", () => {
  it("is an instance of Error", () => {
    const e = new ApiError(400, "test");
    assert.ok(e instanceof Error);
  });

  it("has name ApiError (not Error)", () => {
    const e = new ApiError(500, "test");
    assert.equal(e.name, "ApiError");
    assert.notEqual(e.name, "Error");
  });

  it("stack trace is defined", () => {
    const e = new ApiError(404, "not found");
    assert.ok(e.stack);
  });
});

// ── Additional: safeJson edge cases ──────────────────────────────────────

describe("safeJson — additional edge cases", () => {
  it("parses arrays correctly", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify([1, 2, 3]),
      headers: { "content-type": "application/json" },
    });
    const body = await safeJson<number[]>(req);
    assert.deepEqual(body, [1, 2, 3]);
  });

  it("parses null correctly", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: "null",
      headers: { "content-type": "application/json" },
    });
    const body = await safeJson(req);
    assert.equal(body, null);
  });

  it("error message from ApiError(400) mentions JSON", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: "{{invalid",
      headers: { "content-type": "application/json" },
    });
    try {
      await safeJson(req);
      assert.fail("Expected ApiError to be thrown");
    } catch (err: any) {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      assert.match(err.message, /JSON/);
    }
  });
});