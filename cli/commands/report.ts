import { promises as fs } from "node:fs";
import path from "node:path";
import { loadWorkspace, vaultPaths } from "../../src/lib/vault.js";
import { fail, parseArgs, vaultRoot } from "../util.js";
import {
  EngagementSnapshot,
  LIVE_POST_STATUSES,
  Platform,
  PLATFORMS,
  Post,
  Project,
  ScoreBand,
} from "../../src/lib/types.js";
import {
  describeBand,
  projectThreshold,
  recommend,
  Recommendation,
  scoreIntrinsic,
  scoreLive,
} from "../../src/lib/virality.js";
import { getPlaybook } from "../../src/lib/playbooks.js";
import { WorkspaceState } from "../../src/lib/mutations.js";

/**
 * `doodaboo report` — weekly (or custom-window) markdown report that
 * summarises content performance and feeds back into strategy.
 *
 * The report is deterministic for a given workspace + window. Output
 * goes to `<vault>/exports/reports/<YYYY-Www>.md` by default; pass
 * `--out` to override the path or `--stdout` to skip the write and print
 * to stdout. `--json` emits the structured data instead of the markdown.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_VERSION = "1";

export async function runReport(argv: string[]): Promise<number> {
  // `--help` short-circuits before parseArgs to match the rest of the
  // CLI; util.parseArgs runs in strict mode and would otherwise throw
  // "Unknown option '--help'" because we don't declare a help flag.
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(REPORT_HELP);
    return 0;
  }
  const { values } = parseArgs<{
    window?: string;
    since?: string;
    out?: string;
    stdout?: boolean;
  }>(argv, {
    window: { type: "string" },
    since: { type: "string" },
    out: { type: "string" },
    stdout: { type: "boolean" },
  });
  const root = vaultRoot(values);
  const state = await loadWorkspace(root);

  const now = new Date();
  const windowDays = parseWindow(values.window ?? "7d");
  const end = now;
  const start = values.since
    ? parseSinceFlag(values.since)
    : new Date(end.getTime() - windowDays * DAY_MS);
  if (start.getTime() > end.getTime()) {
    fail(
      `--since (${start.toISOString()}) is after the report end (${end.toISOString()}).`,
    );
  }

  const report = buildReport(state, root, start, end);

  if (values.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }

  const markdown = renderMarkdown(report);

  if (values.stdout) {
    process.stdout.write(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
    return 0;
  }

  const target = values.out
    ? path.resolve(values.out)
    : path.join(
        vaultPaths(root).exportsDir,
        "reports",
        `${report.weekId}.md`,
      );
  await fs.mkdir(path.dirname(target), { recursive: true });
  // Atomic write — `.tmp` then rename, mirroring vault.ts. The tmp
  // suffix mixes pid, a high-res timestamp, and a small random tail so
  // two concurrent runReport calls in the same Node process (e.g. a
  // test harness running multiple windows in parallel) can't collide
  // on the same path. On any error after the write, we best-effort
  // unlink the tmp so a failed rename doesn't leave orphan files.
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, markdown, "utf-8");
  try {
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
  process.stdout.write(`Report written to ${target}\n`);
  return 0;
}

const REPORT_HELP = `doodaboo report — weekly markdown report

Usage:
  doodaboo report [--window=7d] [--since=ISO] [--out=PATH] [--stdout] [--json]

Options:
  --window=<N>d   Length of the window (7d default, also 14d/30d/90d).
  --since=ISO     Explicit start instant (e.g. 2026-03-01T00:00:00Z).
                  Overrides --window. ISO date-only strings are parsed as
                  UTC midnight for stability across timezones.
  --out=<path>    Write to this file instead of
                  <vault>/exports/reports/<weekId>.md.
  --stdout        Print markdown to stdout instead of writing a file.
  --json          Emit the structured report data as JSON.
  --vault=<path>  Override the vault root.
  --help, -h      Show this help.
`;

// ── Window parsing ──────────────────────────────────────────────────────────

/**
 * Accept `7d`, `14d`, `30d`, `90d`. The unit is a single letter; only
 * days are supported because mixing weeks with the YYYY-Www file name
 * would be misleading. Throws a UsageError if the input doesn't match.
 */
export function parseWindow(raw: string): number {
  const m = /^(\d+)([dD])$/.exec(raw.trim());
  if (!m) {
    fail(`--window must look like "7d" or "30d"; got "${raw}".`);
  }
  const n = Number(m![1]);
  if (!Number.isFinite(n) || n <= 0) {
    fail(`--window must be a positive number of days; got "${raw}".`);
  }
  return n;
}

function parseSinceFlag(raw: string): Date {
  // `new Date("2026-03-01")` is UTC midnight per ECMA-262 but
  // `new Date("2026-03-01T00:00:00")` (no Z) is *local* midnight. We
  // normalise date-only strings to UTC so the same user typing the
  // same flag gets the same window regardless of timezone.
  const trimmed = raw.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const d = dateOnly
    ? new Date(`${trimmed}T00:00:00.000Z`)
    : new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    fail(`--since must be a parseable ISO date; got "${raw}".`);
  }
  return d;
}

// ── ISO 8601 week-of-year ───────────────────────────────────────────────────

/**
 * Returns `YYYY-Www`. Implements the ISO 8601 algorithm: shift the
 * input date to the Thursday of its ISO week, then count weeks from
 * the Thursday of the ISO year's first week (the week containing
 * Jan 4). This is more reliable than Sunday/Monday heuristics around
 * year boundaries — e.g. 2027-01-01 belongs to 2026-W53.
 */
export function isoWeekId(input: Date): string {
  // Work in UTC midnight to avoid DST drift moving us across a day
  // boundary. Use setUTCHours / setUTCFullYear rather than the
  // `Date.UTC(year, ...)` form: that form silently adds 1900 to years
  // 0–99 (an ECMA-262 legacy quirk), so a real year-1 input would be
  // re-stamped as year 1901.
  const d = new Date(input.getTime());
  d.setUTCHours(0, 0, 0, 0);
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const jan4 = new Date(0);
  jan4.setUTCFullYear(year, 0, 4);
  jan4.setUTCHours(0, 0, 0, 0);
  const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Thursday = new Date(jan4);
  week1Thursday.setUTCDate(jan4.getUTCDate() + 4 - jan4Day);
  const weekNum =
    1 + Math.round((d.getTime() - week1Thursday.getTime()) / (7 * DAY_MS));
  return `${String(year).padStart(4, "0")}-W${String(weekNum).padStart(2, "0")}`;
}

// ── Report data model ───────────────────────────────────────────────────────

export interface ReportData {
  vault: string;
  weekId: string;
  windowStart: string;
  windowEnd: string;
  windowDays: number;
  generatedAt: string;
  postCounts: {
    total: number;
    inWindow: number;
    live: number;
    scheduled: number;
  };
  projectCounts: { total: number; active: number };
  headline: HeadlineData;
  topPerformers: TopPerformerRow[];
  biggestMovers: { gains: MoverRow[]; regressions: MoverRow[] };
  byPlatform: PlatformRow[];
  factorWeakness: FactorRow[];
  playbookCoverage: PlaybookRow[];
  schedule: ScheduleRow[];
  projectPulse: ProjectPulseRow[];
  version: string;
}

interface HeadlineData {
  avgScoreThis: number | null;
  avgScorePrior: number | null;
  delta: number | null;
  bestPost: { id: string; title: string; score: number; band: ScoreBand } | null;
  hotPlusCount: number;
}

interface TopPerformerRow {
  rank: number;
  score: number;
  band: ScoreBand;
  bandLabel: string;
  platform: Platform;
  title: string;
  postId: string;
  snapshotCount: number;
  projectedMetric: string | null;
  projectedValue: number | null;
}

interface MoverRow {
  rank: number;
  delta: number;
  scoreNow: number;
  platform: Platform;
  title: string;
  postId: string;
}

interface PlatformRow {
  platform: Platform;
  postCount: number;
  avgScore: number;
  hottestPostTitle: string;
  hottestPostId: string;
  hottestPostScore: number;
  hotPlusCount: number;
  avgShareRate: number; // 0..1
}

interface FactorRow {
  factorId: string;
  label: string;
  postCount: number;
  totalGain: number;
  avgGain: number;
}

interface PlaybookRow {
  playbookId: string;
  name: string;
  postCount: number;
  avgScore: number;
}

interface ScheduleRow {
  postId: string;
  title: string;
  platform: Platform;
  scheduledAt: string;
  // True when the scheduledAt is in the past — the post was supposed
  // to be published already but the status is still "scheduled".
  overdue: boolean;
}

interface ProjectPulseRow {
  projectId: string;
  projectKey: string;
  name: string;
  tasksClosed: number;
  tasksCreated: number;
  percentComplete: number;
  status: "on-track" | "at-risk" | "no-target";
  targetDate: string | null;
}

// ── Build ───────────────────────────────────────────────────────────────────

function buildReport(
  state: WorkspaceState,
  root: string,
  start: Date,
  end: Date,
): ReportData {
  const windowMs = end.getTime() - start.getTime();
  const windowDays = Math.max(1, Math.round(windowMs / DAY_MS));

  const postsInWindow = state.posts.filter((p) =>
    postIsInWindow(p, start, end),
  );
  // Disjoint prior cohort: posts that had activity in the prior window
  // *and not* in the current one. Without the second guard, long-lived
  // posts contribute the same scoreFor() to both averages and the
  // headline "Δ vs prior" silently biases toward zero.
  const priorStart = new Date(start.getTime() - windowMs);
  const postsPrior = state.posts.filter(
    (p) =>
      postIsInWindow(p, priorStart, start) && !postIsInWindow(p, start, end),
  );

  return {
    vault: root,
    // Name the file after the ISO week that the *content* covers
    // (anchored on `start`), not the week the report happens to be
    // generated in. A Monday-morning run for last week would otherwise
    // write 2026-W24.md with 2026-W23's data.
    weekId: isoWeekId(start),
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    windowDays,
    generatedAt: new Date().toISOString(),
    postCounts: {
      total: state.posts.length,
      inWindow: postsInWindow.length,
      live: state.posts.filter((p) => p.status === "live").length,
      scheduled: state.posts.filter((p) => p.status === "scheduled").length,
    },
    projectCounts: {
      total: state.projects.length,
      active: state.projects.filter(
        (p) => p.status !== "done" && p.status !== "cancelled",
      ).length,
    },
    headline: buildHeadline(postsInWindow, postsPrior),
    topPerformers: buildTopPerformers(postsInWindow),
    biggestMovers: buildBiggestMovers(postsInWindow, start, end),
    byPlatform: buildByPlatform(postsInWindow),
    factorWeakness: buildFactorWeakness(postsInWindow),
    playbookCoverage: buildPlaybookCoverage(postsInWindow),
    schedule: buildSchedule(state.posts, end),
    projectPulse: buildProjectPulse(state, start, end),
    version: REPORT_VERSION,
  };
}

/**
 * A post counts as "in window" if any of: it was created in-window,
 * updated in-window, posted in-window, scheduled in-window, or has at
 * least one snapshot captured in-window. This matches the intuition
 * that anything with activity during the window belongs in the report.
 */
function postIsInWindow(post: Post, start: Date, end: Date): boolean {
  const dates: (string | undefined)[] = [
    post.createdAt,
    post.updatedAt,
    post.postedAt,
    post.scheduledAt,
    ...post.snapshots.map((s) => s.capturedAt),
  ];
  for (const iso of dates) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    // Inclusive at end: a snapshot captured at exactly `end` (which is
    // `now`) should land inside the window, not excluded by a strict
    // less-than that the frontmatter's `generatedAt` then claims it
    // was included in.
    if (t >= start.getTime() && t <= end.getTime()) return true;
  }
  return false;
}

// Single scoring entry point: compute scoreLive (with intrinsic
// fallback) once per post and cache by Post reference. Every section
// reads through this, so scoring is per-post-O(1) across the whole
// report instead of O(sections × passes). Wrapping in try/catch makes
// the report tolerate a single malformed post (unknown platform,
// missing context/threshold) the same way dash.ts does — one bad row
// no longer aborts the run.
const scoreCache = new WeakMap<Post, { value: number; band: ScoreBand } | null>();

function score(post: Post): { value: number; band: ScoreBand } | null {
  const cached = scoreCache.get(post);
  if (cached !== undefined) return cached;
  let result: { value: number; band: ScoreBand } | null = null;
  try {
    const live = scoreLive(post);
    const s = live ?? scoreIntrinsic(post);
    result = { value: s.value, band: s.band };
  } catch {
    result = null;
  }
  scoreCache.set(post, result);
  return result;
}

function scoreFor(post: Post): number | null {
  return score(post)?.value ?? null;
}

function bandFor(post: Post): ScoreBand | null {
  return score(post)?.band ?? null;
}

function isHotPlus(band: ScoreBand | null): boolean {
  return band === "hot" || band === "rocket";
}

// Wraps projectThreshold so malformed thresholds (out-of-union window,
// missing post.threshold) downgrade to "no projection" instead of
// returning NaN or throwing through a section builder.
function safeProjection(
  post: Post,
): { metric: string; projected: number } | null {
  try {
    const p = projectThreshold(post);
    if (!p || !Number.isFinite(p.projected)) return null;
    return p;
  } catch {
    return null;
  }
}

function safeRecommend(post: Post, max: number): Recommendation[] {
  try {
    return recommend(post, max);
  } catch {
    return [];
  }
}

function bandLabel(band: ScoreBand): string {
  return describeBand(band).label;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return round1(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

// ── Section builders ────────────────────────────────────────────────────────

function buildHeadline(inWindow: Post[], prior: Post[]): HeadlineData {
  // Single pass: cached score() returns the same {value, band} for
  // every consumer below — avg, best, hotPlus — so we don't have to
  // walk inWindow four times.
  const scoresNow: number[] = [];
  let best: HeadlineData["bestPost"] = null;
  let hotPlusCount = 0;
  for (const p of inWindow) {
    const s = score(p);
    if (!s) continue;
    scoresNow.push(s.value);
    if (!best || s.value > best.score) {
      best = { id: p.id, title: p.title, score: s.value, band: s.band };
    }
    if (isHotPlus(s.band)) hotPlusCount += 1;
  }
  const scoresPrior = prior
    .map((p) => scoreFor(p))
    .filter((s): s is number => s != null);
  const avgNow = avg(scoresNow);
  const avgPrior = avg(scoresPrior);
  const delta =
    avgNow != null && avgPrior != null ? round1(avgNow - avgPrior) : null;
  return {
    avgScoreThis: avgNow,
    avgScorePrior: avgPrior,
    delta,
    bestPost: best,
    hotPlusCount,
  };
}

function buildTopPerformers(inWindow: Post[]): TopPerformerRow[] {
  const scored: { post: Post; score: number; band: ScoreBand }[] = [];
  for (const p of inWindow) {
    const s = score(p);
    if (s) scored.push({ post: p, score: s.value, band: s.band });
  }
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];

  // Top decile: posts whose score is at or above the 90th percentile.
  // `scored` is sorted *descending*, so the 90th-percentile cutoff is
  // the score at the boundary of the top ~10% of indices —
  // `ceil(n * 0.1) - 1`, not `floor(n * 0.9) - 1` (which would pick
  // the bottom 10% boundary). The slice(0, 10) cap handles tiny
  // windows where every post is "top decile" against itself.
  const cutoffIdx = Math.max(0, Math.ceil(scored.length * 0.1) - 1);
  const cutoffScore = scored[cutoffIdx].score;
  const decile = scored.filter((x) => x.score >= cutoffScore);
  const taken = decile.slice(0, 10);

  return taken.map((x, i) => {
    const projection = safeProjection(x.post);
    return {
      rank: i + 1,
      score: round1(x.score),
      band: x.band,
      bandLabel: bandLabel(x.band),
      platform: x.post.platform,
      title: x.post.title,
      postId: x.post.id,
      snapshotCount: x.post.snapshots.length,
      projectedMetric: projection?.metric ?? null,
      projectedValue:
        projection != null ? Math.round(projection.projected) : null,
    };
  });
}

function buildBiggestMovers(
  inWindow: Post[],
  start: Date,
  end: Date,
): { gains: MoverRow[]; regressions: MoverRow[] } {
  const rows: MoverRow[] = [];
  for (const post of inWindow) {
    // Skip posts with no snapshots — no movement to report.
    if (post.snapshots.length === 0) continue;
    const sorted = [...post.snapshots].sort((a, b) => a.atMinutes - b.atMinutes);

    // Find the first snapshot captured in-window; the baseline reflects
    // where the score stood when this window began. If no snapshot lands
    // in-window (the post is in-window only because of createdAt etc.),
    // skip it — "movement during the window" is undefined without an
    // in-window measurement, and falling back to the earliest-ever
    // snapshot would silently produce inflated multi-month deltas.
    const firstInWindowIdx = sorted.findIndex((s) => {
      const t = Date.parse(s.capturedAt);
      return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime();
    });
    if (firstInWindowIdx === -1) continue;
    const firstInWindow = sorted[firstInWindowIdx];

    // Include the snapshot immediately *before* the first-in-window
    // snapshot in the baseline so `scoreLive(baselinePost)` has a real
    // `prev` for its velocity factor — otherwise the baseline falls
    // back to virality's cold-start velocity formula while the current
    // score uses real prev, and the resulting delta conflates real
    // engagement growth with a velocity-formula transition.
    const baselineSnapshots =
      firstInWindowIdx > 0
        ? [sorted[firstInWindowIdx - 1], firstInWindow]
        : [firstInWindow];

    const baselinePost = clonePostWithSnapshots(post, baselineSnapshots);
    let baselineScore, currentScore;
    try {
      baselineScore = scoreLive(baselinePost);
      currentScore = scoreLive(post);
    } catch {
      // Malformed post (unknown platform, missing context) — skip it
      // from movers rather than aborting the whole section.
      continue;
    }
    if (!baselineScore || !currentScore) continue;
    const delta = round1(currentScore.value - baselineScore.value);
    if (delta === 0) continue;
    rows.push({
      rank: 0, // assigned after split-and-sort below
      delta,
      scoreNow: round1(currentScore.value),
      platform: post.platform,
      title: post.title,
      postId: post.id,
    });
  }
  // Surface gains and regressions in separate sorted tables so a -30
  // crash never visually outranks a +20 gain under one ambiguous
  // header. Each table is independently capped at 5.
  const gains = rows
    .filter((r) => r.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const regressions = rows
    .filter((r) => r.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 5)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return { gains, regressions };
}

function clonePostWithSnapshots(post: Post, snaps: EngagementSnapshot[]): Post {
  return { ...post, snapshots: snaps };
}

function buildByPlatform(inWindow: Post[]): PlatformRow[] {
  const byPlat = new Map<Platform, Post[]>();
  for (const p of inWindow) {
    const list = byPlat.get(p.platform) ?? [];
    list.push(p);
    byPlat.set(p.platform, list);
  }

  const rows: PlatformRow[] = [];
  for (const [platform, posts] of byPlat) {
    const scored: { post: Post; value: number; band: ScoreBand }[] = [];
    for (const p of posts) {
      const s = score(p);
      if (s) scored.push({ post: p, value: s.value, band: s.band });
    }
    if (scored.length === 0) continue;
    const avgScore = round1(
      scored.reduce((a, b) => a + b.value, 0) / scored.length,
    );

    let hottest = scored[0];
    for (const x of scored) if (x.value > hottest.value) hottest = x;

    const hotPlusCount = scored.filter((x) => isHotPlus(x.band)).length;

    // Avg share rate per post: pick the snapshot with the most reach
    // (max impressions or views), since cumulative engagement metrics
    // can only grow over time, that snapshot has the most reliable
    // shares/impressions ratio. Picking by atMinutes alone would skip
    // posts whose final-by-atMinutes snapshot is a sparse backfill with
    // zero impressions while earlier snapshots had real reach.
    // Snapshots whose impressions AND views are both zero are excluded:
    // previously the Math.max(...,1) fallback divided shares by 1,
    // producing absurd percentages like "500.00%" for a single fresh
    // snapshot.
    const shareRates: number[] = [];
    for (const p of posts) {
      if (p.snapshots.length === 0) continue;
      let best = p.snapshots[0];
      let bestReach = Math.max(best.impressions, best.views);
      for (let i = 1; i < p.snapshots.length; i++) {
        const s = p.snapshots[i];
        const reach = Math.max(s.impressions, s.views);
        if (reach > bestReach) {
          best = s;
          bestReach = reach;
        }
      }
      if (bestReach <= 0) continue;
      shareRates.push(best.shares / bestReach);
    }
    const avgShareRate =
      shareRates.length === 0
        ? 0
        : shareRates.reduce((a, b) => a + b, 0) / shareRates.length;

    rows.push({
      platform,
      postCount: posts.length,
      avgScore,
      hottestPostTitle: hottest.post.title,
      hottestPostId: hottest.post.id,
      hottestPostScore: round1(hottest.value),
      hotPlusCount,
      avgShareRate,
    });
  }
  rows.sort((a, b) => b.avgScore - a.avgScore);
  return rows;
}

function buildFactorWeakness(inWindow: Post[]): FactorRow[] {
  // Aggregate recommend() across every live-ish post in the window.
  // Each recommendation carries a `potentialGain` in score points;
  // summing them gives the workspace's headroom by factor.
  //
  // Use LIVE_POST_STATUSES (which includes "analyzing") so dash and
  // report agree on which posts count as live; the previous bare
  // `status === "live"` filter silently dropped analyzing posts that
  // the dash had already been recommending fixes for.
  //
  // Posts are tracked in a Set so `postCount` reflects the number of
  // distinct posts that surfaced this factor; the previous
  // `e.gains.length` over-counted if recommend() ever returned more
  // than one rec with the same factorId for a single post (today it
  // doesn't, but the rest of the codebase — dash.ts — uses a Set so
  // we match the contract).
  const live = inWindow.filter((p) => LIVE_POST_STATUSES.has(p.status));
  const agg = new Map<
    string,
    { label: string; posts: Set<string>; gains: number[] }
  >();
  for (const post of live) {
    const recs = safeRecommend(post, 12);
    for (const r of recs) {
      const entry =
        agg.get(r.factorId) ?? { label: r.label, posts: new Set(), gains: [] };
      entry.posts.add(post.id);
      entry.gains.push(r.potentialGain);
      agg.set(r.factorId, entry);
    }
  }
  const rows: FactorRow[] = [...agg.entries()].map(([factorId, e]) => ({
    factorId,
    label: e.label,
    postCount: e.posts.size,
    totalGain: round1(e.gains.reduce((a, b) => a + b, 0)),
    avgGain:
      e.gains.length === 0
        ? 0
        : round1(e.gains.reduce((a, b) => a + b, 0) / e.gains.length),
  }));
  rows.sort((a, b) => b.totalGain - a.totalGain);
  return rows.slice(0, 5);
}

function buildPlaybookCoverage(inWindow: Post[]): PlaybookRow[] {
  const agg = new Map<string, { scores: number[] }>();
  for (const post of inWindow) {
    if (!post.playbookId) continue;
    const score = scoreFor(post);
    if (score == null) continue;
    const entry = agg.get(post.playbookId) ?? { scores: [] };
    entry.scores.push(score);
    agg.set(post.playbookId, entry);
  }
  const rows: PlaybookRow[] = [...agg.entries()].map(([id, e]) => {
    const pb = getPlaybook(id);
    return {
      playbookId: id,
      name: pb?.name ?? id,
      postCount: e.scores.length,
      avgScore: round1(e.scores.reduce((a, b) => a + b, 0) / e.scores.length),
    };
  });
  rows.sort((a, b) => b.postCount - a.postCount);
  return rows;
}

function buildSchedule(allPosts: Post[], end: Date): ScheduleRow[] {
  // Surface posts whose scheduledAt is in the next 7 days, AND any
  // posts whose scheduledAt is already past but whose status is still
  // "scheduled" — those are publishing slips the user almost
  // certainly wants flagged. No lookback cap on overdue: a 60-day-old
  // slip is exactly the kind of forgotten draft the section's
  // empty-state copy ("Nothing scheduled in the next 7 days or
  // overdue") promises to cover.
  const horizon = end.getTime() + 7 * DAY_MS;
  const rows: ScheduleRow[] = [];
  for (const p of allPosts) {
    if (p.status !== "scheduled") continue;
    if (!p.scheduledAt) continue;
    const t = Date.parse(p.scheduledAt);
    if (!Number.isFinite(t)) continue;
    if (t > horizon) continue;
    rows.push({
      postId: p.id,
      title: p.title,
      platform: p.platform,
      scheduledAt: p.scheduledAt,
      overdue: t < end.getTime(),
    });
  }
  // Overdue first (most urgent), then upcoming chronologically.
  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt);
  });
  return rows;
}

function buildProjectPulse(
  state: WorkspaceState,
  start: Date,
  end: Date,
): ProjectPulseRow[] {
  const rows: ProjectPulseRow[] = [];
  for (const project of state.projects) {
    const tasks = state.tasks.filter((t) => t.projectId === project.id);
    const closed = tasks.filter(
      (t) => t.status === "done" && isInWindow(t.updatedAt, start, end),
    ).length;
    const created = tasks.filter((t) =>
      isInWindow(t.createdAt, start, end),
    ).length;

    // Only surface projects with activity in the window OR that are
    // currently active. Quiet, archived projects stay out.
    const isActive =
      project.status !== "done" && project.status !== "cancelled";
    if (closed === 0 && created === 0 && !isActive) continue;

    // Exclude cancelled tasks from the denominator: a project with 5
    // done + 5 cancelled is shipped, not 50% complete. dash.ts already
    // uses the (status !== "done" && status !== "cancelled") convention
    // for its open-task counts; mirror that here.
    const denominatorTasks = tasks.filter((t) => t.status !== "cancelled");
    const doneTasks = denominatorTasks.filter(
      (t) => t.status === "done",
    ).length;
    const percentComplete =
      denominatorTasks.length === 0
        ? 0
        : Math.round((doneTasks / denominatorTasks.length) * 100);

    const status = projectStatus(project, percentComplete, end);
    rows.push({
      projectId: project.id,
      projectKey: project.key,
      name: project.name,
      tasksClosed: closed,
      tasksCreated: created,
      percentComplete,
      status,
      targetDate: project.targetDate ?? null,
    });
  }
  rows.sort(
    (a, b) =>
      b.tasksClosed + b.tasksCreated - (a.tasksClosed + a.tasksCreated),
  );
  return rows;
}

/**
 * On-track vs at-risk: time elapsed toward the target date shouldn't be
 * meaningfully ahead of percent complete. If we're 80% of the way
 * through the schedule but only 40% done, flag at-risk. A 15-point
 * grace band keeps small lags from tipping into at-risk.
 */
function projectStatus(
  project: Project,
  percentComplete: number,
  end: Date,
): "on-track" | "at-risk" | "no-target" {
  if (!project.targetDate) return "no-target";
  const target = Date.parse(project.targetDate);
  const created = Date.parse(project.createdAt);
  if (!Number.isFinite(target) || !Number.isFinite(created)) return "no-target";
  if (end.getTime() >= target) {
    return percentComplete >= 95 ? "on-track" : "at-risk";
  }
  const span = target - created;
  if (span <= 0) return "on-track";
  const elapsed = Math.max(0, end.getTime() - created);
  const pctElapsed = (elapsed / span) * 100;
  return percentComplete + 15 >= pctElapsed ? "on-track" : "at-risk";
}

function isInWindow(
  iso: string | undefined,
  start: Date,
  end: Date,
): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= start.getTime() && t < end.getTime();
}

// ── Markdown render ─────────────────────────────────────────────────────────

const PLATFORM_LABEL = new Map<Platform, string>(
  PLATFORMS.map((p) => [p.id, p.label]),
);

function platformLabel(id: Platform): string {
  return PLATFORM_LABEL.get(id) ?? id;
}

/** Escape pipe and newline characters so markdown tables stay intact. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  // Escape pipes (markdown table delimiter) and collapse any line
  // breaks — including Windows-style \r\n — to a single space.
  // Stripping only \n leaves a raw CR in the cell which some markdown
  // renderers display as a control glyph or stray block break.
  return String(value)
    .replace(/\|/g, "\\|")
    .replace(/\r\n|\r|\n/g, " ");
}

function renderTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}

export function renderMarkdown(r: ReportData): string {
  const sections: string[] = [];

  // 1. Frontmatter
  sections.push(
    [
      "---",
      `vault: ${r.vault}`,
      `window:`,
      `  start: ${r.windowStart}`,
      `  end: ${r.windowEnd}`,
      `  days: ${r.windowDays}`,
      `weekId: ${r.weekId}`,
      `generatedAt: ${r.generatedAt}`,
      `posts:`,
      `  total: ${r.postCounts.total}`,
      `  inWindow: ${r.postCounts.inWindow}`,
      `  live: ${r.postCounts.live}`,
      `  scheduled: ${r.postCounts.scheduled}`,
      `projects:`,
      `  total: ${r.projectCounts.total}`,
      `  active: ${r.projectCounts.active}`,
      "---",
    ].join("\n"),
  );

  sections.push(`# Report ${r.weekId}`);

  // 2. Headline
  sections.push(renderHeadline(r));

  // 3. Top performers
  sections.push("## Top performers");
  if (r.topPerformers.length === 0) {
    sections.push("_No scored posts in this window._");
  } else {
    sections.push(
      renderTable(
        ["#", "Score", "Band", "Platform", "Title", "Snaps", "Projected"],
        r.topPerformers.map((p) => [
          cell(p.rank),
          cell(p.score),
          cell(p.bandLabel),
          cell(platformLabel(p.platform)),
          cell(p.title),
          cell(p.snapshotCount),
          p.projectedValue != null && p.projectedMetric
            ? cell(`${p.projectedValue.toLocaleString()} ${p.projectedMetric}`)
            : "—",
        ]),
      ),
    );
  }

  // 4. Biggest gains
  sections.push("## Biggest gains");
  if (r.biggestMovers.gains.length === 0) {
    sections.push("_No posts gained score in-window._");
  } else {
    sections.push(
      renderTable(
        ["#", "Δ", "Score now", "Platform", "Title"],
        r.biggestMovers.gains.map((m) => [
          cell(m.rank),
          cell(`+${m.delta}`),
          cell(m.scoreNow),
          cell(platformLabel(m.platform)),
          cell(m.title),
        ]),
      ),
    );
  }

  // 4b. Biggest regressions
  sections.push("## Biggest regressions");
  if (r.biggestMovers.regressions.length === 0) {
    sections.push("_No posts regressed in-window._");
  } else {
    sections.push(
      renderTable(
        ["#", "Δ", "Score now", "Platform", "Title"],
        r.biggestMovers.regressions.map((m) => [
          cell(m.rank),
          cell(String(m.delta)),
          cell(m.scoreNow),
          cell(platformLabel(m.platform)),
          cell(m.title),
        ]),
      ),
    );
  }

  // 5. By platform
  sections.push("## By platform");
  if (r.byPlatform.length === 0) {
    sections.push("_No platforms with activity in this window._");
  } else {
    sections.push(
      renderTable(
        ["Platform", "Posts", "Avg score", "Hottest", "Hot+", "Avg share rate"],
        r.byPlatform.map((p) => [
          cell(platformLabel(p.platform)),
          cell(p.postCount),
          cell(p.avgScore),
          cell(`${p.hottestPostTitle} (${p.hottestPostScore})`),
          cell(p.hotPlusCount),
          cell(pct(p.avgShareRate)),
        ]),
      ),
    );
  }

  // 6. Factor weakness
  sections.push("## Factor weakness");
  if (r.factorWeakness.length === 0) {
    sections.push(
      "_No live posts surfaced actionable recommendations this window._",
    );
  } else {
    sections.push(
      renderTable(
        ["Factor", "Posts", "Total potential gain", "Avg gain"],
        r.factorWeakness.map((f) => [
          cell(f.label),
          cell(f.postCount),
          cell(`+${f.totalGain}`),
          cell(`+${f.avgGain}`),
        ]),
      ),
    );
  }

  // 7. Playbook coverage
  sections.push("## Playbook coverage");
  if (r.playbookCoverage.length === 0) {
    sections.push("_No posts in this window are using a playbook._");
  } else {
    sections.push(
      renderTable(
        ["Playbook", "Posts", "Avg score"],
        r.playbookCoverage.map((p) => [
          cell(p.name),
          cell(p.postCount),
          cell(p.avgScore),
        ]),
      ),
    );
  }

  // 8. Schedule — past-due slips first, then upcoming.
  sections.push("## Schedule");
  if (r.schedule.length === 0) {
    sections.push("_Nothing scheduled in the next 7 days or overdue._");
  } else {
    sections.push(
      renderTable(
        ["When", "Status", "Platform", "Title"],
        r.schedule.map((s) => [
          cell(s.scheduledAt),
          cell(s.overdue ? "⚠ overdue" : "upcoming"),
          cell(platformLabel(s.platform)),
          cell(s.title),
        ]),
      ),
    );
  }

  // 9. Project pulse
  sections.push("## Project pulse");
  if (r.projectPulse.length === 0) {
    sections.push("_No project activity in this window._");
  } else {
    sections.push(
      renderTable(
        ["Project", "Closed", "Created", "% complete", "Status", "Target"],
        r.projectPulse.map((p) => [
          cell(`${p.projectKey} · ${p.name}`),
          cell(p.tasksClosed),
          cell(p.tasksCreated),
          cell(`${p.percentComplete}%`),
          cell(statusLabel(p.status)),
          cell(p.targetDate ?? "—"),
        ]),
      ),
    );
  }

  // 10. Footer
  sections.push(
    `---\n_Generated ${r.generatedAt} · doodaboo report v${r.version}_`,
  );

  return `${sections.join("\n\n")}\n`;
}

function statusLabel(s: "on-track" | "at-risk" | "no-target"): string {
  switch (s) {
    case "on-track":
      return "on-track";
    case "at-risk":
      return "at-risk";
    case "no-target":
      return "no target";
  }
}

function renderHeadline(r: ReportData): string {
  const parts: string[] = [];
  if (r.headline.avgScoreThis == null) {
    parts.push("No scored posts in this window.");
  } else {
    const deltaText =
      r.headline.delta == null
        ? "no prior-window data"
        : `${r.headline.delta >= 0 ? "+" : ""}${r.headline.delta} vs prior window`;
    parts.push(`Avg score **${r.headline.avgScoreThis}** (${deltaText}).`);
  }
  if (r.headline.bestPost) {
    parts.push(
      `Best post: **${r.headline.bestPost.title}** (${r.headline.bestPost.score}, ${bandLabel(r.headline.bestPost.band)}).`,
    );
  }
  parts.push(`Hot+ posts: **${r.headline.hotPlusCount}**.`);
  return `## Headline\n\n${parts.join(" ")}`;
}
