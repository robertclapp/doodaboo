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
      // Footer summary line includes all three counts. The earlier
      // regex only anchored "hot" and "overdue", so a missing "open"
      // count would have passed the test.
      assert.match(out, /\d+ open · \d+ hot · \d+ overdue · last save:/);
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

  it("respects --limit on every list section (including recommendations)", async () => {
    // Compare an unrestricted run against --limit=1; for sections
    // whose unrestricted result is at least one row, the limited run
    // must trim to exactly 1. This guards against the earlier
    // pass-vacuously trap where a naturally-empty section satisfied
    // `length <= 1` even if --limit were silently ignored.
    const unlimited = captureStdout();
    let full: {
      sections: {
        myDay: unknown[];
        hotPosts: unknown[];
        needsSnapshots: unknown[];
        recommendations: unknown[];
        overdue: unknown[];
      };
    };
    try {
      const code = await runDash([
        "--vault",
        root,
        "--limit",
        "20",
        "--json",
      ]);
      assert.equal(code, 0);
      full = JSON.parse(unlimited.output);
    } finally {
      unlimited.restore();
    }

    const limited = captureStdout();
    let small: typeof full;
    try {
      const code = await runDash(["--vault", root, "--limit", "1", "--json"]);
      assert.equal(code, 0);
      small = JSON.parse(limited.output);
    } finally {
      limited.restore();
    }

    for (const key of [
      "myDay",
      "hotPosts",
      "needsSnapshots",
      "recommendations",
      "overdue",
    ] as const) {
      const expected = Math.min(full.sections[key].length, 1);
      assert.equal(
        small.sections[key].length,
        expected,
        `section ${key} should respect --limit=1 (full=${full.sections[key].length}, got ${small.sections[key].length})`,
      );
    }
  });

  it("measures snapshot staleness by capturedAt, not atMinutes (backfill-safe)", async () => {
    // Reproduce the atMinutes-vs-capturedAt bug: give a live post two
    // snapshots — a fresh capture today at atMinutes=30 and a stale
    // backfilled capture from 6 months ago at atMinutes=1440. The old
    // code sorted by atMinutes, picked the 1440 entry, and reported the
    // post as months stale; the fix reads max(capturedAt), so the post
    // is correctly considered fresh and never lands in NEEDS SNAPSHOTS.
    const wsFile = path.join(root, "workspace.json");
    const raw = JSON.parse(await fs.readFile(wsFile, "utf-8"));
    const livePosts = (raw.posts as Array<{
      id: string;
      status: string;
      snapshots: Array<{ capturedAt: string; atMinutes: number }>;
    }>).filter((p) => p.status === "live" || p.status === "analyzing");
    assert.ok(livePosts.length > 0, "seed must contain a live post");
    const today = new Date().toISOString();
    const sixMonthsAgo = new Date(
      Date.now() - 180 * 24 * 60 * 60 * 1000,
    ).toISOString();
    livePosts[0].snapshots = [
      { capturedAt: today, atMinutes: 30, id: "s-fresh", impressions: 100, views: 100, likes: 0, comments: 0, shares: 0, saves: 0 } as never,
      { capturedAt: sixMonthsAgo, atMinutes: 1440, id: "s-stale-backfill", impressions: 200, views: 200, likes: 0, comments: 0, shares: 0, saves: 0 } as never,
    ];
    await fs.writeFile(wsFile, JSON.stringify(raw, null, 2), "utf-8");

    const cap = captureStdout();
    let parsed: { sections: { needsSnapshots: Array<{ id: string }> } };
    try {
      const code = await runDash(["--vault", root, "--json"]);
      assert.equal(code, 0);
      parsed = JSON.parse(cap.output);
    } finally {
      cap.restore();
    }
    const targetId = livePosts[0].id;
    assert.ok(
      !parsed.sections.needsSnapshots.some((r) => r.id === targetId),
      `post with fresh capturedAt should NOT be flagged as needing a snapshot (got ${JSON.stringify(
        parsed.sections.needsSnapshots.map((r) => r.id),
      )})`,
    );
  });

  it("tolerates a malformed post (unknown platform) without crashing", async () => {
    // Inject a live post with a platform value outside the PROFILES
    // union. The scoring engine throws on that, but dash should catch
    // and still render every section.
    const wsFile = path.join(root, "workspace.json");
    const raw = JSON.parse(await fs.readFile(wsFile, "utf-8"));
    const livePosts = (raw.posts as Array<{ status: string; platform: string }>).filter(
      (p) => p.status === "live" || p.status === "analyzing",
    );
    assert.ok(livePosts.length > 0, "seed must contain a live post");
    livePosts[0].platform = "myspace_2007" as never;
    await fs.writeFile(wsFile, JSON.stringify(raw, null, 2), "utf-8");

    const cap = captureStdout();
    try {
      const code = await runDash(["--vault", root]);
      assert.equal(code, 0);
      assert.match(cap.output, /HOT POSTS/);
      assert.match(cap.output, /TOP RECOMMENDATIONS/);
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
