import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { initVault } from "../../src/lib/vault.js";
import { runDash } from "./dash.js";

/**
 * The dash command is read-only — we initialize a vault, then invoke
 * `runDash` while capturing stdout. We avoid spawning child processes
 * (slow, flaky on CI) by stubbing `process.stdout.write` for the duration
 * of the call.
 */

async function tmpVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "doodaboo-dash-test-"));
}

interface Capture {
  output: string;
  restore: () => void;
}

function captureStdout(): Capture {
  const original = process.stdout.write.bind(process.stdout);
  const chunks: string[] = [];
  process.stdout.write = ((chunk: unknown): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  return {
    get output() {
      return chunks.join("");
    },
    restore: () => {
      process.stdout.write = original;
    },
  };
}

describe("runDash", () => {
  let root: string;

  beforeEach(async () => {
    root = await tmpVault();
    await initVault(root, { force: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("renders every section header against the seed workspace", async () => {
    const cap = captureStdout();
    try {
      const code = await runDash(["--vault", root]);
      assert.equal(code, 0);
      const out = cap.output;
      // Top-line + every section title.
      assert.match(out, /doodaboo dash/);
      assert.match(out, /MY DAY/);
      assert.match(out, /HOT POSTS/);
      assert.match(out, /NEEDS SNAPSHOTS/);
      assert.match(out, /TOP RECOMMENDATIONS/);
      assert.match(out, /OVERDUE/);
      // Footer summary line is present.
      assert.match(out, /open · \d+ hot · \d+ overdue · last save:/);
      // Uses unicode box dividers, not ASCII dashes.
      assert.match(out, /─{10}/);
      // Never exceeds the 80-char width budget.
      for (const line of out.split("\n")) {
        assert.ok(
          [...line].length <= 80,
          `line too wide (${[...line].length}): ${line}`,
        );
      }
    } finally {
      cap.restore();
    }
  });

  it("emits a valid JSON object with the documented shape under --json", async () => {
    const cap = captureStdout();
    let parsed: unknown;
    try {
      const code = await runDash(["--vault", root, "--json"]);
      assert.equal(code, 0);
      parsed = JSON.parse(cap.output);
    } finally {
      cap.restore();
    }
    const obj = parsed as Record<string, unknown>;
    assert.equal(typeof obj.vault, "string");
    assert.ok(obj.currentUser && typeof obj.currentUser === "object");
    assert.ok(obj.totals && typeof obj.totals === "object");
    const totals = obj.totals as Record<string, number>;
    for (const k of [
      "projects",
      "tasks",
      "posts",
      "labels",
      "openTasks",
      "livePosts",
    ]) {
      assert.equal(typeof totals[k], "number", `totals.${k} should be number`);
    }
    const sections = obj.sections as Record<string, unknown>;
    for (const k of [
      "myDay",
      "hotPosts",
      "needsSnapshots",
      "recommendations",
      "overdue",
    ]) {
      assert.ok(Array.isArray(sections[k]), `sections.${k} should be array`);
    }
    const summary = obj.summary as Record<string, unknown>;
    assert.equal(typeof summary.open, "number");
    assert.equal(typeof summary.hot, "number");
    assert.equal(typeof summary.overdue, "number");
  });

  it("honors --no-recommendations by omitting the section", async () => {
    const cap = captureStdout();
    try {
      const code = await runDash(["--vault", root, "--no-recommendations"]);
      assert.equal(code, 0);
      const out = cap.output;
      assert.ok(!/TOP RECOMMENDATIONS/.test(out), "should skip rec section");
      // The other sections still render.
      assert.match(out, /MY DAY/);
      assert.match(out, /HOT POSTS/);
      assert.match(out, /OVERDUE/);
    } finally {
      cap.restore();
    }

    // And the JSON form returns an empty recommendations array.
    const cap2 = captureStdout();
    try {
      const code = await runDash([
        "--vault",
        root,
        "--no-recommendations",
        "--json",
      ]);
      assert.equal(code, 0);
      const parsed = JSON.parse(cap2.output) as {
        sections: { recommendations: unknown[] };
      };
      assert.equal(parsed.sections.recommendations.length, 0);
    } finally {
      cap2.restore();
    }
  });

  it("respects --limit on every list section", async () => {
    const cap = captureStdout();
    try {
      const code = await runDash(["--vault", root, "--limit", "1", "--json"]);
      assert.equal(code, 0);
      const parsed = JSON.parse(cap.output) as {
        sections: {
          myDay: unknown[];
          hotPosts: unknown[];
          needsSnapshots: unknown[];
          overdue: unknown[];
        };
      };
      assert.ok(parsed.sections.myDay.length <= 1);
      assert.ok(parsed.sections.hotPosts.length <= 1);
      assert.ok(parsed.sections.needsSnapshots.length <= 1);
      assert.ok(parsed.sections.overdue.length <= 1);
    } finally {
      cap.restore();
    }
  });

  it("shows --help without touching the vault", async () => {
    const cap = captureStdout();
    try {
      // Pass a deliberately missing vault path; --help should short-circuit
      // before loadWorkspace runs.
      const code = await runDash([
        "--help",
        "--vault",
        "/this/path/does/not/exist/dash",
      ]);
      assert.equal(code, 0);
      assert.match(cap.output, /doodaboo dash/);
      assert.match(cap.output, /--no-recommendations/);
    } finally {
      cap.restore();
    }
  });
});
