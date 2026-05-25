import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bounded, fail, nonneg, parseArgs, row, UsageError } from "./util";

describe("nonneg", () => {
  it("accepts a valid finite non-negative number", () => {
    assert.equal(nonneg("42", "x"), 42);
    assert.equal(nonneg("0", "x"), 0);
    assert.equal(nonneg("3.14", "x"), 3.14);
  });

  it("rejects undefined / empty string with a missing-flag error", () => {
    assert.throws(() => nonneg(undefined, "x"), /Missing required flag: --x/);
    assert.throws(() => nonneg("", "x"), /Missing required flag: --x/);
  });

  it("rejects non-numeric input (NaN guard)", () => {
    assert.throws(() => nonneg("foo", "at"), /--at must be a finite number/);
  });

  it("rejects Infinity", () => {
    assert.throws(
      () => nonneg("Infinity", "at"),
      /--at must be a finite number/,
    );
  });

  it("rejects negative numbers", () => {
    assert.throws(() => nonneg("-1", "x"), /--x must be non-negative/);
  });
});

describe("bounded", () => {
  it("accepts a value inside [min, max]", () => {
    assert.equal(bounded("50", "p", 0, 100), 50);
    assert.equal(bounded("0", "p", 0, 100), 0);
    assert.equal(bounded("100", "p", 0, 100), 100);
  });

  it("rejects below min and above max", () => {
    assert.throws(() => bounded("-1", "p", 0, 100), /between 0 and 100/);
    assert.throws(() => bounded("101", "p", 0, 100), /between 0 and 100/);
  });

  it("rejects empty / non-numeric", () => {
    assert.throws(() => bounded("", "p", 0, 100), /Missing required flag/);
    assert.throws(() => bounded("foo", "p", 0, 100), /finite number/);
  });
});

describe("fail / UsageError", () => {
  it("throws a UsageError with the given message", () => {
    try {
      fail("bad input");
      assert.fail("fail() should have thrown");
    } catch (err) {
      assert.ok(err instanceof UsageError);
      assert.equal((err as UsageError).message, "bad input");
    }
  });
});

describe("parseArgs", () => {
  it("always supports --vault and --json globals", () => {
    const r = parseArgs(["--vault", "/tmp/v", "--json"], {});
    assert.equal(r.values.vault, "/tmp/v");
    assert.equal(r.values.json, true);
  });

  it("merges command-specific options without losing globals", () => {
    const r = parseArgs<{ title?: string }>(["--title", "x", "--json"], {
      title: { type: "string" },
    });
    assert.equal(r.values.title, "x");
    assert.equal(r.values.json, true);
  });

  it("collects positional arguments", () => {
    const r = parseArgs(["one", "two"], {});
    assert.deepEqual(r.positionals, ["one", "two"]);
  });

  it("throws on unknown flag (strict mode)", () => {
    assert.throws(() => parseArgs(["--made-up"], {}));
  });
});

describe("row", () => {
  it("pads every cell except the last", () => {
    const out = row("a", "b", "c");
    // Last cell is not padded; middle cells are padded.
    assert.match(out, /^a +b +c$/);
  });

  it("renders undefined/null as em-dash", () => {
    assert.match(row(undefined, "x"), /^— +x$/);
    assert.match(row(null as unknown as undefined, "x"), /^— +x$/);
  });
});
