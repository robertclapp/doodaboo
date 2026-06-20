import { promises as fs } from "node:fs";
import { loadWorkspace, vaultPaths } from "../../src/lib/vault.js";
import { parseArgs, vaultRoot, fail } from "../util.js";
import {
  LIVE_POST_STATUSES,
  Post,
  Priority,
  Project,
  Task,
  User,
  PLATFORMS,
} from "../../src/lib/types.js";
import { priorityRank } from "../../src/lib/utils.js";
import {
  describeBand,
  recommend,
  scoreIntrinsic,
  scoreLive,
  Recommendation,
} from "../../src/lib/virality.js";

/**
 * `doodaboo dash` — one-screen daily-driver snapshot of the workspace.
 *
 * Pure read-only. Renders six sections (header, my day, hot posts,
 * needs snapshots, recommendations, overdue) + a footer summary using
 * brutalist mono-style text — Unicode box dividers, padEnd columns,
 * never wider than 80 chars. `--json` returns the same structured data
 * the renderer uses, so this command stays scriptable like every other.
 */

const HELP = `doodaboo dash — terminal dashboard

Usage:
  doodaboo dash [options]

Options:
  --vault <path>        Override the vault root.
  --json                Emit a single JSON object with all sections.
  --limit <n>           Top-N override per section (default 5).
  --no-recommendations  Skip the recommendations section.
  --help                Show this help.
`;

const DIVIDER = "─".repeat(72);
const MAX_WIDTH = 80;
const DEFAULT_LIMIT = 5;

// "Open" tasks for the "my day" section: actionable things assigned to you.
const MY_DAY_STATUSES = new Set(["todo", "in_progress", "in_review"]);
const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;

export async function runDash(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP);
    return 0;
  }

  const { values } = parseArgs<{
    limit?: string;
    "no-recommendations"?: boolean;
  }>(argv, {
    limit: { type: "string" },
    "no-recommendations": { type: "boolean" },
  });

  const root = vaultRoot(values);
  const state = await loadWorkspace(root);
  const limit = parseLimit(values.limit);
  const skipRecommendations = values["no-recommendations"] === true;

  const now = Date.now();
  const me = state.users.find((u) => u.id === state.currentUserId);
  const lastUpdate = await readLastUpdate(root);

  const myDay = buildMyDay(state.tasks, state.projects, state.currentUserId, limit, now);
  const hot = buildHotPosts(state.posts, limit);
  const needsSnapshots = buildNeedsSnapshots(state.posts, limit, now);
  const recommendations = skipRecommendations
    ? []
    : buildRecommendations(state.posts, limit);
  const overdue = buildOverdue(state.tasks, state.projects, limit, now);
  const openTotal = state.tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  ).length;
  const liveTotal = state.posts.filter((p) => LIVE_POST_STATUSES.has(p.status)).length;

  if (values.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          vault: vaultPaths(root).root,
          currentUser: me
            ? { id: me.id, handle: me.handle, name: me.name }
            : { id: state.currentUserId, handle: null, name: null },
          totals: {
            projects: state.projects.length,
            tasks: state.tasks.length,
            posts: state.posts.length,
            labels: state.labels.length,
            openTasks: openTotal,
            livePosts: liveTotal,
          },
          lastUpdate,
          sections: {
            myDay,
            hotPosts: hot,
            needsSnapshots,
            recommendations,
            overdue,
          },
          summary: {
            open: openTotal,
            hot: hot.length,
            overdue: overdue.length,
            lastUpdate,
          },
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  const lines: string[] = [];
  lines.push(...renderHeader(vaultPaths(root).root, me, state, lastUpdate, now));
  lines.push("");
  lines.push(...renderSection("MY DAY", renderMyDay(myDay)));
  lines.push("");
  lines.push(...renderSection("HOT POSTS", renderHotPosts(hot)));
  lines.push("");
  lines.push(...renderSection("NEEDS SNAPSHOTS", renderNeedsSnapshots(needsSnapshots)));
  if (!skipRecommendations) {
    lines.push("");
    lines.push(...renderSection("TOP RECOMMENDATIONS", renderRecommendations(recommendations)));
  }
  lines.push("");
  lines.push(...renderSection("OVERDUE", renderOverdue(overdue)));
  lines.push("");
  lines.push(DIVIDER);
  lines.push(renderFooter(openTotal, hot.length, overdue.length, lastUpdate, now));

  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

// ── Data shaping ────────────────────────────────────────────────────────────

interface MyDayRow {
  key: string;
  taskId: string;
  priority: Priority;
  priorityIcon: string;
  due: string;
  dueRaw?: string;
  title: string;
}

interface HotPostRow {
  id: string;
  platform: string;
  platformShort: string;
  score: number;
  band: string;
  title: string;
  snapshots: number;
}

interface NeedsSnapshotRow {
  id: string;
  platform: string;
  platformShort: string;
  title: string;
  lastSnapshotAt?: string;
  staleness: string;
}

interface RecommendationRow {
  factorId: string;
  label: string;
  averageGain: number;
  postCount: number;
}

interface OverdueRow {
  key: string;
  taskId: string;
  priorityIcon: string;
  daysOverdue: number;
  title: string;
  due?: string;
}

function buildMyDay(
  tasks: Task[],
  projects: Project[],
  userId: string,
  limit: number,
  now: number,
): MyDayRow[] {
  const projectKey = (id: string) =>
    projects.find((p) => p.id === id)?.key ?? "???";
  const mine = tasks.filter(
    (t) => t.assigneeId === userId && MY_DAY_STATUSES.has(t.status),
  );
  mine.sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  });
  return mine.slice(0, limit).map((t) => ({
    key: `${projectKey(t.projectId)}-${t.number}`,
    taskId: t.id,
    priority: t.priority,
    priorityIcon: priorityIcon(t.priority),
    due: dueRelative(t.dueDate, now),
    dueRaw: t.dueDate,
    title: t.title,
  }));
}

function buildHotPosts(posts: Post[], limit: number): HotPostRow[] {
  const live = posts.filter((p) => LIVE_POST_STATUSES.has(p.status));
  const scored = live
    .map((p) => {
      // Defensive: a single malformed post shouldn't kill the whole dash.
      // Mirror buildRecommendations' try/catch so the invariant holds.
      try {
        const score = scoreLive(p) ?? scoreIntrinsic(p);
        return { post: p, score };
      } catch {
        return undefined;
      }
    })
    .filter(
      (r): r is { post: Post; score: ReturnType<typeof scoreIntrinsic> } =>
        r !== undefined,
    );
  scored.sort((a, b) => b.score.value - a.score.value);
  return scored.slice(0, limit).map(({ post, score }) => ({
    id: post.id,
    platform: post.platform,
    platformShort: platformShort(post.platform),
    score: Number(score.value.toFixed(1)),
    band: describeBand(score.band).label,
    title: post.title,
    snapshots: post.snapshots.length,
  }));
}

function buildNeedsSnapshots(
  posts: Post[],
  limit: number,
  now: number,
): NeedsSnapshotRow[] {
  const candidates = posts
    // "analyzing" posts have the same need-a-snapshot pressure as
    // "live" — every other live-section helper uses LIVE_POST_STATUSES,
    // so match that contract here.
    .filter((p) => LIVE_POST_STATUSES.has(p.status))
    .map((p) => {
      // Staleness is "when was the most recent snapshot RECORDED?" —
      // that's max(capturedAt), not max(atMinutes). Sorting by atMinutes
      // would pick the snapshot at the largest post-launch offset, which
      // can be an out-of-order backfill captured months ago even though
      // a smaller-atMinutes snapshot was recorded today.
      const last = lastCapturedSnapshot(p);
      return { post: p, lastAt: last, stale: last === undefined || now - last > SNAPSHOT_STALE_MS };
    })
    .filter((r) => r.stale)
    .sort((a, b) => {
      // No-snapshot posts first, then oldest snapshot.
      if (a.lastAt === undefined && b.lastAt !== undefined) return -1;
      if (b.lastAt === undefined && a.lastAt !== undefined) return 1;
      return (a.lastAt ?? 0) - (b.lastAt ?? 0);
    })
    .slice(0, limit);

  return candidates.map(({ post, lastAt }) => ({
    id: post.id,
    platform: post.platform,
    platformShort: platformShort(post.platform),
    title: post.title,
    // Strict undefined check so an epoch-0 lastAt (corrupt capturedAt)
    // stays consistent with the staleness branch below, which also
    // keys off `=== undefined`.
    lastSnapshotAt:
      lastAt === undefined ? undefined : new Date(lastAt).toISOString(),
    staleness:
      lastAt === undefined
        ? "no snapshots"
        : `${relativeAge(now - lastAt)} old`,
  }));
}

function buildRecommendations(posts: Post[], limit: number): RecommendationRow[] {
  const live = posts.filter((p) => LIVE_POST_STATUSES.has(p.status));
  const bucket = new Map<
    string,
    { label: string; gains: number[]; posts: Set<string> }
  >();
  for (const p of live) {
    let recs: Recommendation[];
    try {
      recs = recommend(p);
    } catch {
      // Defensive: a malformed post shouldn't kill the whole dash.
      continue;
    }
    for (const r of recs) {
      const entry = bucket.get(r.factorId) ?? {
        label: r.label,
        gains: [],
        posts: new Set<string>(),
      };
      entry.gains.push(r.potentialGain);
      entry.posts.add(p.id);
      bucket.set(r.factorId, entry);
    }
  }
  const rows: RecommendationRow[] = [];
  for (const [factorId, entry] of bucket) {
    const avg =
      entry.gains.reduce((s, n) => s + n, 0) / Math.max(entry.gains.length, 1);
    rows.push({
      factorId,
      label: entry.label,
      averageGain: Number(avg.toFixed(1)),
      postCount: entry.posts.size,
    });
  }
  rows.sort((a, b) => b.averageGain - a.averageGain);
  return rows.slice(0, limit);
}

function buildOverdue(
  tasks: Task[],
  projects: Project[],
  limit: number,
  now: number,
): OverdueRow[] {
  const projectKey = (id: string) =>
    projects.find((p) => p.id === id)?.key ?? "???";
  const over = tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        t.status !== "cancelled" &&
        t.dueDate &&
        new Date(t.dueDate).getTime() < now,
    )
    .map((t) => ({
      task: t,
      due: new Date(t.dueDate as string).getTime(),
    }))
    .sort((a, b) => a.due - b.due);
  return over.slice(0, limit).map(({ task, due }) => ({
    key: `${projectKey(task.projectId)}-${task.number}`,
    taskId: task.id,
    priorityIcon: priorityIcon(task.priority),
    daysOverdue: Math.max(1, Math.floor((now - due) / (24 * 60 * 60 * 1000))),
    title: task.title,
    due: task.dueDate,
  }));
}

// ── Rendering ───────────────────────────────────────────────────────────────

function renderHeader(
  vault: string,
  me: User | undefined,
  state: { projects: { length: number }; tasks: { length: number }; posts: { length: number }; labels: { length: number } },
  lastUpdate: string | undefined,
  now: number,
): string[] {
  const handle = me ? `@${me.handle}` : "@unknown";
  const updated = lastUpdate
    ? `${relativeAge(now - new Date(lastUpdate).getTime())} ago`
    : "never";
  return [
    truncate(`doodaboo dash · ${vault}`, MAX_WIDTH),
    truncate(`you ${handle}`, MAX_WIDTH),
    truncate(
      `projects ${state.projects.length}  tasks ${state.tasks.length}  posts ${state.posts.length}  labels ${state.labels.length}  · saved ${updated}`,
      MAX_WIDTH,
    ),
  ];
}

function renderSection(title: string, body: string[]): string[] {
  return [DIVIDER, title, ...body];
}

function renderMyDay(rows: MyDayRow[]): string[] {
  if (rows.length === 0) return ["(nothing assigned to you)"];
  return rows.map((r) =>
    truncate(
      `${pad(r.key, 9)} ${pad(r.priorityIcon, 3)} ${pad(r.due, 11)} ${r.title}`,
      MAX_WIDTH,
    ),
  );
}

function renderHotPosts(rows: HotPostRow[]): string[] {
  if (rows.length === 0) return ["(no live or analyzing posts)"];
  return rows.map((r) =>
    truncate(
      `${pad(r.platformShort, 3)} ${pad(r.score.toFixed(1), 6)} ${pad(r.band, 10)} ${pad(`snaps:${r.snapshots}`, 9)} ${r.title}`,
      MAX_WIDTH,
    ),
  );
}

function renderNeedsSnapshots(rows: NeedsSnapshotRow[]): string[] {
  if (rows.length === 0) return ["(all live posts have fresh snapshots)"];
  const tail: string[] = rows.map((r) =>
    truncate(
      `${pad(r.platformShort, 3)} ${pad(r.staleness, 14)} ${r.title}`,
      MAX_WIDTH,
    ),
  );
  tail.push("(capture engagement with `doodaboo post snap <id> --at=… …`)");
  return tail;
}

function renderRecommendations(rows: RecommendationRow[]): string[] {
  if (rows.length === 0) return ["(no obvious wins across live posts)"];
  return rows.map((r) =>
    truncate(
      `+${pad(r.averageGain.toFixed(1), 5)} ${pad(`${r.postCount} post${r.postCount === 1 ? "" : "s"}`, 9)} ${r.label}`,
      MAX_WIDTH,
    ),
  );
}

function renderOverdue(rows: OverdueRow[]): string[] {
  if (rows.length === 0) return ["(no overdue tasks)"];
  return rows.map((r) =>
    truncate(
      `${pad(r.key, 9)} ${pad(r.priorityIcon, 3)} ${pad(`overdue ${r.daysOverdue}d`, 13)} ${r.title}`,
      MAX_WIDTH,
    ),
  );
}

function renderFooter(
  open: number,
  hot: number,
  overdue: number,
  lastUpdate: string | undefined,
  now: number,
): string {
  const saved = lastUpdate
    ? `${relativeAge(now - new Date(lastUpdate).getTime())} ago`
    : "never";
  return truncate(
    `${open} open · ${hot} hot · ${overdue} overdue · last save: ${saved}`,
    MAX_WIDTH,
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    fail(`--limit must be a positive integer; got "${raw}".`);
  }
  return Math.floor(n);
}

async function readLastUpdate(root: string): Promise<string | undefined> {
  try {
    const stat = await fs.stat(vaultPaths(root).workspaceFile);
    return new Date(stat.mtimeMs).toISOString();
  } catch {
    return undefined;
  }
}

// "Was a snapshot recorded recently?" picks the snapshot with the
// largest wall-clock capturedAt. Returns undefined for no snapshots or
// when every capturedAt is unparseable; the caller treats either case
// as "needs a snapshot." This is intentionally NOT the same as
// scoreLive's "latest snapshot" (max atMinutes), which answers a
// different question — what's the most recent data point in the post's
// lifetime — and stays in the scoring engine.
function lastCapturedSnapshot(post: Post): number | undefined {
  let max: number | undefined = undefined;
  for (const s of post.snapshots) {
    const t = Date.parse(s.capturedAt);
    if (!Number.isFinite(t)) continue;
    if (max === undefined || t > max) max = t;
  }
  return max;
}

function priorityIcon(p: Priority): string {
  switch (p) {
    case "urgent": return "!!!";
    case "high": return "!!";
    case "medium": return "!";
    case "low": return ".";
    case "none":
    default: return "-";
  }
}

function platformShort(platform: string): string {
  return (
    PLATFORMS.find((p) => p.id === platform)?.short ?? platform.slice(0, 2).toUpperCase()
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dueRelative(iso: string | undefined, now: number): string {
  if (!iso) return "—";
  const due = new Date(iso).getTime();
  if (!Number.isFinite(due)) return "—";
  // Anchor "today" in UTC to match the stored dueDate's parsing — the
  // vault writes Z-suffixed ISO timestamps, so comparing against a
  // local-midnight boundary would off-by-one for users east/west of
  // UTC near midnight.
  const todayStart = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  );
  const dueDate = new Date(due);
  const dueStart = Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate(),
  );
  const days = Math.round((dueStart - todayStart) / DAY_MS);
  if (days === 0) return "today";
  if (days > 0) return `+${days}d`;
  return `overdue ${-days}d`;
}

function relativeAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d`;
  const mo = Math.round(days / 30);
  return `${mo}mo`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width);
}

function truncate(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}…`;
}
