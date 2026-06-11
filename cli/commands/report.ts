import { promises as fs } from "node:fs";
import path from "node:path";
import { loadWorkspace, vaultPaths } from "../../src/lib/vault.js";
import { fail, parseArgs, vaultRoot } from "../util.js";
import {
  EngagementSnapshot,
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
  // Atomic write — `.tmp` then rename, mirroring vault.ts's saveWorkspace.
  const tmp = `${target}.tmp-${process.pid}`;
  await fs.writeFile(tmp, markdown, "utf-8");
  await fs.rename(tmp, target);
  process.stdout.write(`Report written to ${target}\n`);
  return 0;
}

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
  const d = new Date(raw);
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
  // Work in UTC to avoid DST drift moving us across a day boundary.
  const d = new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()),
  );
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Thursday = new Date(jan4);
  week1Thursday.setUTCDate(jan4.getUTCDate() + 4 - jan4Day);
  const weekNum =
    1 + Math.round((d.getTime() - week1Thursday.getTime()) / (7 * DAY_MS));
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
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
  biggestMovers: MoverRow[];
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
  const priorStart = new Date(start.getTime() - windowMs);
  const postsPrior = state.posts.filter((p) =>
    postIsInWindow(p, priorStart, start),
  );

  return {
    vault: root,
    weekId: isoWeekId(end),
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
    if (t >= start.getTime() && t < end.getTime()) return true;
  }
  return false;
}

function scoreFor(post: Post): number | null {
  const live = scoreLive(post);
  if (live) return live.value;
  const intrinsic = scoreIntrinsic(post);
  return intrinsic.value;
}

function bandFor(post: Post): ScoreBand {
  const live = scoreLive(post);
  return (live ?? scoreIntrinsic(post)).band;
}

function isHotPlus(band: ScoreBand): boolean {
  return band === "hot" || band === "rocket";
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
  const scoresNow = inWindow
    .map((p) => scoreFor(p))
    .filter((s): s is number => s != null);
  const scoresPrior = prior
    .map((p) => scoreFor(p))
    .filter((s): s is number => s != null);
  const avgNow = avg(scoresNow);
  const avgPrior = avg(scoresPrior);
  const delta =
    avgNow != null && avgPrior != null ? round1(avgNow - avgPrior) : null;

  let best: HeadlineData["bestPost"] = null;
  for (const p of inWindow) {
    const score = scoreFor(p);
    if (score == null) continue;
    if (!best || score > best.score) {
      best = { id: p.id, title: p.title, score, band: bandFor(p) };
    }
  }

  const hotPlusCount = inWindow.filter((p) => isHotPlus(bandFor(p))).length;

  return {
    avgScoreThis: avgNow,
    avgScorePrior: avgPrior,
    delta,
    bestPost: best,
    hotPlusCount,
  };
}

function buildTopPerformers(inWindow: Post[]): TopPerformerRow[] {
  const scored = inWindow
    .map((p) => ({ post: p, score: scoreFor(p) }))
    .filter((x): x is { post: Post; score: number } => x.score != null)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];

  // Top decile: posts whose score is at or above the 90th percentile.
  // The slice(0, 10) cap handles tiny windows where every post is "top
  // decile" against itself.
  const cutoffIdx = Math.max(0, Math.floor(scored.length * 0.9) - 1);
  const cutoffScore = scored[cutoffIdx].score;
  const decile = scored.filter((x) => x.score >= cutoffScore);
  const taken = decile.slice(0, 10);

  return taken.map((x, i) => {
    const band = bandFor(x.post);
    const projection = projectThreshold(x.post);
    return {
      rank: i + 1,
      score: round1(x.score),
      band,
      bandLabel: bandLabel(band),
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
): MoverRow[] {
  const rows: MoverRow[] = [];
  for (const post of inWindow) {
    // Skip posts with no snapshots — no movement to report.
    if (post.snapshots.length === 0) continue;
    const sorted = [...post.snapshots].sort((a, b) => a.atMinutes - b.atMinutes);
    // First snapshot captured in-window, or fall back to the earliest
    // snapshot overall. A post with only one snapshot total gives
    // delta = 0 and falls out of the list below — that's the
    // "graceful single-snapshot" contract the tests pin down.
    const firstInWindow =
      sorted.find((s) => {
        const t = Date.parse(s.capturedAt);
        return (
          Number.isFinite(t) && t >= start.getTime() && t < end.getTime()
        );
      }) ?? sorted[0];

    const baselinePost = clonePostWithSnapshots(post, [firstInWindow]);
    const baselineScore = scoreLive(baselinePost);
    const currentScore = scoreLive(post);
    if (!baselineScore || !currentScore) continue;
    const delta = round1(currentScore.value - baselineScore.value);
    if (delta === 0) continue;
    rows.push({
      rank: 0, // assigned after sort
      delta,
      scoreNow: round1(currentScore.value),
      platform: post.platform,
      title: post.title,
      postId: post.id,
    });
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return rows.slice(0, 5).map((r, i) => ({ ...r, rank: i + 1 }));
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
    const scores = posts
      .map((p) => scoreFor(p))
      .filter((s): s is number => s != null);
    if (scores.length === 0) continue;
    const avgScore = round1(scores.reduce((a, b) => a + b, 0) / scores.length);

    let hottest: { post: Post; score: number } | null = null;
    for (const p of posts) {
      const s = scoreFor(p);
      if (s == null) continue;
      if (!hottest || s > hottest.score) hottest = { post: p, score: s };
    }

    const hotPlusCount = posts.filter((p) => isHotPlus(bandFor(p))).length;

    // Avg share rate from the latest snapshot of each post that has
    // any snapshots — captures the cohort's actual diffusion. Posts
    // without snapshots are excluded from the share-rate average; they
    // still count in postCount.
    const shareRates: number[] = [];
    for (const p of posts) {
      if (p.snapshots.length === 0) continue;
      const latest = [...p.snapshots]
        .sort((a, b) => a.atMinutes - b.atMinutes)
        .slice(-1)[0];
      const impressions = Math.max(latest.impressions, latest.views, 1);
      shareRates.push(latest.shares / impressions);
    }
    const avgShareRate =
      shareRates.length === 0
        ? 0
        : shareRates.reduce((a, b) => a + b, 0) / shareRates.length;

    rows.push({
      platform,
      postCount: posts.length,
      avgScore,
      hottestPostTitle: hottest!.post.title,
      hottestPostId: hottest!.post.id,
      hottestPostScore: round1(hottest!.score),
      hotPlusCount,
      avgShareRate,
    });
  }
  rows.sort((a, b) => b.avgScore - a.avgScore);
  return rows;
}

function buildFactorWeakness(inWindow: Post[]): FactorRow[] {
  // Aggregate recommend() across every live post in the window. Each
  // recommendation carries a `potentialGain` in score points; summing
  // them gives the workspace's headroom by factor.
  const live = inWindow.filter((p) => p.status === "live");
  const agg = new Map<string, { label: string; gains: number[] }>();
  for (const post of live) {
    const recs: Recommendation[] = recommend(post, 12);
    for (const r of recs) {
      const entry = agg.get(r.factorId) ?? { label: r.label, gains: [] };
      entry.gains.push(r.potentialGain);
      agg.set(r.factorId, entry);
    }
  }
  const rows: FactorRow[] = [...agg.entries()].map(([factorId, e]) => ({
    factorId,
    label: e.label,
    postCount: e.gains.length,
    totalGain: round1(e.gains.reduce((a, b) => a + b, 0)),
    avgGain: round1(e.gains.reduce((a, b) => a + b, 0) / e.gains.length),
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
  const horizon = new Date(end.getTime() + 7 * DAY_MS).getTime();
  const rows: ScheduleRow[] = [];
  for (const p of allPosts) {
    if (p.status !== "scheduled") continue;
    if (!p.scheduledAt) continue;
    const t = Date.parse(p.scheduledAt);
    if (!Number.isFinite(t)) continue;
    if (t < end.getTime() || t > horizon) continue;
    rows.push({
      postId: p.id,
      title: p.title,
      platform: p.platform,
      scheduledAt: p.scheduledAt,
    });
  }
  rows.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
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

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === "done").length;
    const percentComplete =
      totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

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
  const s = String(value);
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
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

  // 4. Biggest movers
  sections.push("## Biggest movers");
  if (r.biggestMovers.length === 0) {
    sections.push("_No posts with enough snapshot movement to report._");
  } else {
    sections.push(
      renderTable(
        ["#", "Δ", "Score now", "Platform", "Title"],
        r.biggestMovers.map((m) => [
          cell(m.rank),
          cell(`${m.delta >= 0 ? "+" : ""}${m.delta}`),
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

  // 8. Schedule
  sections.push("## Schedule (next 7 days)");
  if (r.schedule.length === 0) {
    sections.push("_Nothing scheduled in the next 7 days._");
  } else {
    sections.push(
      renderTable(
        ["When", "Platform", "Title"],
        r.schedule.map((s) => [
          cell(s.scheduledAt),
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
