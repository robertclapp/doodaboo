import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isoWeekId,
  parseWindow,
  renderMarkdown,
  runReport,
  ReportData,
} from "./report";
import { initVault, vaultPaths } from "../../src/lib/vault";

// Each tmpVault() creates a fresh /tmp/doodaboo-report-* directory.
// Track them all and remove at suite end so long-lived runners (CI,
// dev laptops) don't accumulate orphan vaults.
const tmpRoots: string[] = [];
async function tmpVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "doodaboo-report-"));
  tmpRoots.push(root);
  await initVault(root, { force: true });
  return root;
}
after(async () => {
  await Promise.all(
    tmpRoots.map((r) => fs.rm(r, { recursive: true, force: true })),
  );
});

/**
 * Capture stdout for the duration of `fn`. `runReport` writes status
 * lines and (for --json/--stdout) the payload via process.stdout.write,
 * so we patch the write hook rather than wrap a stream.
 */
async function captureStdout(fn: () => Promise<number>): Promise<{
  code: number;
  out: string;
}> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // The signature of process.stdout.write is overloaded; the cast keeps
  // TS happy without pulling in a broader patching shim.
  (process.stdout as unknown as { write: (s: string) => boolean }).write = (
    s: string,
  ) => {
    chunks.push(s);
    return true;
  };
  try {
    const code = await fn();
    return { code, out: chunks.join("") };
  } finally {
    (process.stdout as unknown as { write: typeof orig }).write = orig;
  }
}

describe("parseWindow", () => {
  it("accepts 7d, 14d, 30d, 90d", () => {
    assert.equal(parseWindow("7d"), 7);
    assert.equal(parseWindow("14d"), 14);
    assert.equal(parseWindow("30d"), 30);
    assert.equal(parseWindow("90d"), 90);
  });

  it("accepts upper-case D", () => {
    assert.equal(parseWindow("21D"), 21);
  });

  it("rejects garbage and unknown units", () => {
    assert.throws(() => parseWindow("7"));
    assert.throws(() => parseWindow("7h"));
    assert.throws(() => parseWindow("week"));
    assert.throws(() => parseWindow(""));
    assert.throws(() => parseWindow("0d"));
  });
});

describe("isoWeekId", () => {
  it("returns YYYY-Www zero-padded", () => {
    assert.match(isoWeekId(new Date("2026-04-15T12:00:00Z")), /^\d{4}-W\d{2}$/);
  });

  it("handles the early-January boundary (W01)", () => {
    // 2026-01-01 is a Thursday and falls in 2026-W01 by ISO 8601.
    assert.equal(isoWeekId(new Date("2026-01-01T00:00:00Z")), "2026-W01");
  });

  it("handles the late-December boundary (rolls to next ISO year)", () => {
    // 2024-12-30 falls into 2025-W01 (Mon of week containing Jan 1, 2025).
    assert.equal(isoWeekId(new Date("2024-12-30T00:00:00Z")), "2025-W01");
  });

  it("treats 2026-W53 / 2027-W01 correctly", () => {
    // 2026 has 53 ISO weeks (Thursday of last week falls in 2026), so
    // 2027-01-01 (Friday) belongs to 2026-W53.
    assert.equal(isoWeekId(new Date("2027-01-01T00:00:00Z")), "2026-W53");
  });

  it("zero-pads sub-1000 ISO years to 4 digits and preserves the actual year", () => {
    // Two guards in one test:
    //   1. Format guard — year is padded to 4 digits, so a year-1 input
    //      yields "0001-W01" not "1-W01".
    //   2. Value guard — the year is the actual input year, not
    //      something silently re-stamped by Date.UTC(year, ...)'s
    //      legacy +1900 offset for years 0-99 (which would emit
    //      "1901-W01" for the same input).
    const id = isoWeekId(new Date("0001-01-04T00:00:00Z"));
    assert.match(id, /^\d{4}-W\d{2}$/);
    assert.ok(id.startsWith("0001-"), `expected year 0001, got "${id}"`);
  });
});

describe("runReport — file output", () => {
  it("writes the report to <vault>/exports/reports/<weekId>.md", async () => {
    const root = await tmpVault();
    const { code, out } = await captureStdout(() => runReport(["--vault", root]));
    assert.equal(code, 0);

    const reportsDir = path.join(vaultPaths(root).exportsDir, "reports");
    const files = await fs.readdir(reportsDir);
    assert.equal(files.length, 1);
    assert.match(files[0], /^\d{4}-W\d{2}\.md$/);
    assert.match(out, /Report written to/);

    const md = await fs.readFile(path.join(reportsDir, files[0]), "utf-8");
    // YAML frontmatter at the top.
    assert.ok(md.startsWith("---\n"));
    assert.match(md, /weekId: \d{4}-W\d{2}/);
    // All ten sections we promised.
    for (const heading of [
      "## Headline",
      "## Top performers",
      "## Biggest gains",
      "## Biggest regressions",
      "## By platform",
      "## Factor weakness",
      "## Playbook coverage",
      "## Schedule",
      "## Project pulse",
    ]) {
      assert.ok(
        md.includes(heading),
        `expected section "${heading}" in rendered markdown`,
      );
    }
    // Footer with version + generated timestamp.
    assert.match(md, /doodaboo report v\d+/);
  });

  it("--out overrides the default destination", async () => {
    const root = await tmpVault();
    const dest = path.join(root, "custom", "weekly.md");
    const { code } = await captureStdout(() =>
      runReport(["--vault", root, "--out", dest]),
    );
    assert.equal(code, 0);
    const stat = await fs.stat(dest);
    assert.ok(stat.isFile());
  });

  it("--stdout prints markdown and skips the write", async () => {
    const root = await tmpVault();
    const { code, out } = await captureStdout(() =>
      runReport(["--vault", root, "--stdout"]),
    );
    assert.equal(code, 0);
    assert.match(out, /^---\n/);
    assert.match(out, /## Headline/);
    const reportsDir = path.join(vaultPaths(root).exportsDir, "reports");
    await assert.rejects(fs.readdir(reportsDir));
  });

  it("--json emits a valid ReportData JSON payload", async () => {
    const root = await tmpVault();
    const { code, out } = await captureStdout(() =>
      runReport(["--vault", root, "--json"]),
    );
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as ReportData;
    assert.equal(typeof parsed.weekId, "string");
    assert.match(parsed.weekId, /^\d{4}-W\d{2}$/);
    assert.equal(typeof parsed.windowStart, "string");
    assert.equal(typeof parsed.windowEnd, "string");
    assert.equal(typeof parsed.windowDays, "number");
    assert.ok(Array.isArray(parsed.topPerformers));
    assert.ok(parsed.biggestMovers && typeof parsed.biggestMovers === "object");
    assert.ok(Array.isArray(parsed.biggestMovers.gains));
    assert.ok(Array.isArray(parsed.biggestMovers.regressions));
    assert.ok(Array.isArray(parsed.byPlatform));
    assert.ok(Array.isArray(parsed.factorWeakness));
    assert.ok(Array.isArray(parsed.playbookCoverage));
    assert.ok(Array.isArray(parsed.schedule));
    assert.ok(Array.isArray(parsed.projectPulse));
    assert.equal(parsed.headline.hotPlusCount >= 0, true);
    // No file should have been written when --json is requested.
    const reportsDir = path.join(vaultPaths(root).exportsDir, "reports");
    await assert.rejects(fs.readdir(reportsDir));
  });
});

describe("runReport — window flags", () => {
  it("--since overrides --window", async () => {
    const root = await tmpVault();
    // --since 0001 is so early that every post in the seed falls
    // inside the window; --window=7d alone would exclude old seed data.
    const { code, out } = await captureStdout(() =>
      runReport([
        "--vault",
        root,
        "--json",
        "--window",
        "7d",
        "--since",
        "0001-01-01T00:00:00Z",
      ]),
    );
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as ReportData;
    // The seed posts' createdAt is 2026-03-30, so a since=year-1
    // window must capture them all.
    assert.equal(parsed.windowStart.startsWith("0001-"), true);
    assert.ok(parsed.postCounts.inWindow >= 1, "expected seed posts in window");
  });

  it("rejects --since that is after now", async () => {
    const root = await tmpVault();
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { code } = await captureStdout(() =>
      runReport(["--vault", root, "--since", future]).catch(() => 1),
    );
    assert.equal(code, 1);
  });
});

describe("biggest movers — gracefully handles single-snapshot posts", () => {
  it("does not crash and zero-delta posts are filtered out", async () => {
    const root = await tmpVault();
    // Trim every post in the seed to at most one snapshot — this forces
    // every post's mover delta to 0 (baseline == current), so the gains
    // and regressions tables must come back EMPTY (the previous
    // assertion "no row has delta=0" passed vacuously on an empty
    // array even if the filter was broken).
    const wsFile = path.join(root, "workspace.json");
    const raw = JSON.parse(await fs.readFile(wsFile, "utf-8"));
    let trimmedCount = 0;
    for (const p of raw.posts as Array<{ snapshots: unknown[] }>) {
      if (Array.isArray(p.snapshots) && p.snapshots.length > 1) {
        p.snapshots = [p.snapshots[0]];
        trimmedCount += 1;
      } else if (Array.isArray(p.snapshots) && p.snapshots.length === 0) {
        // Posts with zero snapshots are already excluded by the
        // mover builder — leave them alone.
      }
    }
    assert.ok(trimmedCount > 0, "seed must contain a multi-snapshot post");
    await fs.writeFile(wsFile, JSON.stringify(raw, null, 2), "utf-8");

    const { code, out } = await captureStdout(() =>
      runReport([
        "--vault",
        root,
        "--json",
        "--since",
        "0001-01-01T00:00:00Z",
      ]),
    );
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as ReportData;
    assert.ok(
      parsed.biggestMovers && typeof parsed.biggestMovers === "object",
    );
    // Every single-snapshot post collapses to delta=0 and is filtered
    // out, so BOTH gains and regressions must be empty. Asserting the
    // empty-length pins the "filter zero deltas" contract — the
    // previous "for each row, delta !== 0" check passed even when the
    // arrays were empty.
    assert.equal(parsed.biggestMovers.gains.length, 0);
    assert.equal(parsed.biggestMovers.regressions.length, 0);
  });
});

describe("runReport — robustness against malformed posts", () => {
  it("does not crash when a post has a platform value outside the PROFILES union", async () => {
    // The scoring engine throws on `PROFILES[unknownPlatform].intrinsicWeights`.
    // Report previously had no try/catch around scoreFor / bandFor /
    // recommend / projectThreshold, so one bad post killed the whole
    // run. The fix wraps every virality call so a single malformed row
    // is silently skipped from the scored sections while everything
    // else still renders.
    const root = await tmpVault();
    const wsFile = path.join(root, "workspace.json");
    const raw = JSON.parse(await fs.readFile(wsFile, "utf-8"));
    (raw.posts as Array<{ platform: string }>)[0].platform = "myspace_2007";
    await fs.writeFile(wsFile, JSON.stringify(raw, null, 2), "utf-8");

    const { code, out } = await captureStdout(() =>
      runReport([
        "--vault",
        root,
        "--json",
        "--since",
        "0001-01-01T00:00:00Z",
      ]),
    );
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as ReportData;
    // The malformed post is filtered out of scored sections; the rest
    // of the report still computes.
    assert.equal(typeof parsed.weekId, "string");
    assert.ok(Array.isArray(parsed.topPerformers));
    assert.ok(Array.isArray(parsed.byPlatform));
  });
});

describe("runReport — schedule surfaces old slips without lookback", () => {
  it("includes a >30-day-overdue scheduled post in the schedule section", async () => {
    // Bug: buildSchedule previously bounded overdue lookback to 30
    // days, so a 60-day-old slip was silently dropped while the
    // empty-state copy claimed coverage of "or overdue". The fix
    // removes the lookback cap for past-scheduled posts.
    const root = await tmpVault();
    const wsFile = path.join(root, "workspace.json");
    const raw = JSON.parse(await fs.readFile(wsFile, "utf-8"));
    const sixtyDaysAgo = new Date(
      Date.now() - 60 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const targetPost = (raw.posts as Array<{
      id: string;
      status: string;
      scheduledAt?: string;
    }>)[0];
    targetPost.status = "scheduled";
    targetPost.scheduledAt = sixtyDaysAgo;
    await fs.writeFile(wsFile, JSON.stringify(raw, null, 2), "utf-8");

    const { code, out } = await captureStdout(() =>
      runReport(["--vault", root, "--json"]),
    );
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as ReportData;
    const hit = parsed.schedule.find((s) => s.postId === targetPost.id);
    assert.ok(
      hit,
      `expected 60-day-overdue scheduled post in schedule (got ${JSON.stringify(
        parsed.schedule.map((s) => s.postId),
      )})`,
    );
    assert.equal(hit!.overdue, true);
  });
});

describe("runReport — --help short-circuit", () => {
  it("shows help without touching the vault", async () => {
    // Deliberately bogus vault path; --help must short-circuit before
    // loadWorkspace runs, so this should still succeed.
    const { code, out } = await captureStdout(() =>
      runReport([
        "--help",
        "--vault",
        "/this/path/does/not/exist/report",
      ]),
    );
    assert.equal(code, 0);
    assert.match(out, /doodaboo report/);
    assert.match(out, /--window/);
    assert.match(out, /--since/);
    assert.match(out, /--out/);
    assert.match(out, /--stdout/);
    assert.match(out, /--json/);
  });
});

describe("renderMarkdown — empty workspace", () => {
  it("renders graceful placeholders when no data is in window", () => {
    const empty: ReportData = {
      vault: "/tmp/example",
      weekId: "2026-W19",
      windowStart: "2026-05-04T00:00:00.000Z",
      windowEnd: "2026-05-11T00:00:00.000Z",
      windowDays: 7,
      generatedAt: "2026-05-11T12:00:00.000Z",
      postCounts: { total: 0, inWindow: 0, live: 0, scheduled: 0 },
      projectCounts: { total: 0, active: 0 },
      headline: {
        avgScoreThis: null,
        avgScorePrior: null,
        delta: null,
        bestPost: null,
        hotPlusCount: 0,
      },
      topPerformers: [],
      biggestMovers: { gains: [], regressions: [] },
      byPlatform: [],
      factorWeakness: [],
      playbookCoverage: [],
      schedule: [],
      projectPulse: [],
      version: "1",
    };
    const md = renderMarkdown(empty);
    assert.match(md, /## Headline/);
    assert.match(md, /No scored posts in this window/);
    assert.match(md, /## Top performers/);
    assert.match(md, /_No scored posts in this window._/);
  });
});
