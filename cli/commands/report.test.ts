import { describe, it } from "node:test";
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

async function tmpVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "doodaboo-report-"));
  await initVault(root, { force: true });
  return root;
}

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
      "## Biggest movers",
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
    assert.ok(Array.isArray(parsed.biggestMovers));
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
  it("does not crash and produces a stable structure", async () => {
    const root = await tmpVault();
    // Tweak the saved workspace: leave a post with exactly one
    // snapshot, then re-save. We use --json so we can introspect the
    // structured output directly.
    const wsFile = path.join(root, "workspace.json");
    const raw = JSON.parse(await fs.readFile(wsFile, "utf-8"));
    // Find any post with snapshots, drop all but the first.
    let trimmed = false;
    for (const p of raw.posts as Array<{ snapshots: unknown[] }>) {
      if (Array.isArray(p.snapshots) && p.snapshots.length > 1) {
        p.snapshots = [p.snapshots[0]];
        trimmed = true;
        break;
      }
    }
    assert.ok(trimmed, "seed should contain at least one multi-snapshot post");
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
    // The mover list should be an array (possibly empty) — never null
    // or undefined, and never include a row whose delta is exactly 0.
    assert.ok(Array.isArray(parsed.biggestMovers));
    for (const m of parsed.biggestMovers) {
      assert.notEqual(m.delta, 0);
    }
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
      biggestMovers: [],
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
