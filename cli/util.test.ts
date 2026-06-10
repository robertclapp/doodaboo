import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bounded,
  fail,
  nonneg,
  parseArgs,
  row,
  UsageError,
  vaultRoot,
} from "./util";
import { defaultVaultRoot } from "../src/lib/vault";

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

  it("coerces numbers to strings and pads them", () => {
    const out = row(42, "tail");
    assert.match(out, /^42 +tail$/);
  });

  it("single-cell row is the value unpadded", () => {
    assert.equal(row("only"), "only");
  });

  it("padded cells are at least 22 chars wide (PAD constant contract)", () => {
    const out = row("a", "tail");
    // Match the padded first cell width.
    const padded = out.replace(/tail$/, "");
    assert.ok(padded.length >= 22, `padded width ${padded.length}`);
  });
});

describe("nonneg / bounded — additional edge cases", () => {
  it("nonneg error message names the flag", () => {
    try {
      nonneg("foo", "myflag");
      assert.fail("should throw");
    } catch (err) {
      assert.match((err as Error).message, /--myflag/);
    }
  });

  it("nonneg accepts '-0' and returns negative zero", () => {
    // Number("-0") is -0; it's non-negative so nonneg accepts it.
    // assert.equal uses Object.is, so this pins the exact -0 return.
    assert.equal(nonneg("-0", "x"), -0);
  });

  it("bounded rejects positive Infinity", () => {
    assert.throws(() => bounded("Infinity", "x", 0, 100));
  });

  it("bounded rejects negative Infinity", () => {
    assert.throws(() => bounded("-Infinity", "x", 0, 100));
  });
});

describe("UsageError shape", () => {
  it("has name 'UsageError'", () => {
    assert.equal(new UsageError("x").name, "UsageError");
  });

  it("is an instance of Error", () => {
    assert.ok(new UsageError("x") instanceof Error);
  });
});

describe("parseArgs — more shapes", () => {
  it("no-flags call returns empty values and empty positionals", () => {
    const r = parseArgs([], {});
    assert.deepEqual(r.positionals, []);
    // Globals are always defined as the option spec but absent in values.
    assert.equal(r.values.vault, undefined);
    assert.equal(r.values.json, undefined);
  });

  it("positionals and named flags coexist", () => {
    const r = parseArgs<{ title?: string }>(
      ["one", "--title", "x", "two"],
      { title: { type: "string" } },
    );
    assert.deepEqual(r.positionals, ["one", "two"]);
    assert.equal(r.values.title, "x");
  });
});

describe("vaultRoot", () => {
  it("returns the --vault value when provided", () => {
    assert.equal(vaultRoot({ vault: "/tmp/explicit" }), "/tmp/explicit");
  });

  it("falls back to defaultVaultRoot() when --vault is undefined", () => {
    assert.equal(vaultRoot({}), defaultVaultRoot());
  });
});

describe("row — extra shapes", () => {
  it("zero-cell call returns empty string", () => {
    assert.equal(row(), "");
  });

  it("number 0 renders as '0' (not em-dash)", () => {
    assert.match(row(0, "tail"), /^0 +tail$/);
  });

  it("a cell longer than PAD overflows without truncation", () => {
    const long = "x".repeat(40);
    const out = row(long, "tail");
    assert.ok(out.includes(long));
  });
});
