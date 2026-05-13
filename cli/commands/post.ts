import { loadWorkspace, withWorkspace } from "../../src/lib/vault.js";
import {
  addSnapshot,
  createPost,
  duplicatePost,
  updatePost,
} from "../../src/lib/mutations.js";
import { bounded, fail, nonneg, parseArgs, row, vaultRoot } from "../util.js";
import { Platform, Post, PostFormat, PostStatus } from "../../src/lib/types.js";
import {
  describeBand,
  recommend,
  scoreIntrinsic,
  scoreLive,
} from "../../src/lib/virality.js";

export async function runPost(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "list":
    case undefined:
      return list(rest);
    case "new":
      return create(rest);
    case "show":
      return show(rest);
    case "score":
      return score(rest);
    case "recommend":
      return recommendCmd(rest);
    case "snap":
    case "snapshot":
      return snap(rest);
    case "variant":
      return variant(rest);
    case "set":
      return setFields(rest);
    default:
      fail(
        `Unknown post subcommand: ${sub}. Try list, new, show, score, recommend, snap, variant, set.`,
      );
  }
}

async function list(argv: string[]): Promise<number> {
  const { values } = parseArgs<{
    platform?: string;
    status?: string;
  }>(argv, {
    platform: { type: "string" },
    status: { type: "string" },
  });
  const state = await loadWorkspace(vaultRoot(values));
  const posts = state.posts
    .filter((p) => !values.platform || p.platform === values.platform)
    .filter((p) => !values.status || p.status === values.status);

  if (values.json) {
    process.stdout.write(
      `${JSON.stringify(
        posts.map((p) => ({
          ...p,
          intrinsic: scoreIntrinsic(p),
          live: scoreLive(p),
        })),
        null,
        2,
      )}\n`,
    );
    return 0;
  }
  if (posts.length === 0) {
    process.stdout.write("No posts.\n");
    return 0;
  }
  process.stdout.write(`${row("ID", "PLATFORM", "STATUS", "SCORE", "TITLE")}\n`);
  for (const p of posts) {
    const live = scoreLive(p);
    const score = live ?? scoreIntrinsic(p);
    process.stdout.write(
      `${row(p.id, p.platform, p.status, score.value.toFixed(0), p.title)}\n`,
    );
  }
  return 0;
}

async function create(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs<{
    title?: string;
    platform?: string;
    format?: string;
    hook?: string;
    caption?: string;
    duration?: string;
  }>(argv, {
    title: { type: "string", short: "t" },
    platform: { type: "string", short: "p" },
    format: { type: "string", short: "f" },
    hook: { type: "string" },
    caption: { type: "string" },
    duration: { type: "string" },
  });
  const title = values.title ?? positionals[0];
  if (!title) fail("Provide a title.");
  if (!values.platform) fail("Provide --platform=tiktok|reels|shorts|...");

  const post = await withWorkspace((s) => {
    const r = createPost(s, {
      title,
      platform: values.platform as Platform,
      content: {
        hook: values.hook ?? "",
        caption: values.caption ?? "",
        hashtags: [],
        transcript: "",
        format: (values.format ?? "video") as PostFormat,
        durationSec: values.duration ? Number(values.duration) : undefined,
        hasTrendingAudio: false,
      },
      context: {
        audienceSize: 1000,
        accountAvgViews: 200,
        postingHour: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        topicCategory: "general",
        novelty: 3,
        emotion: 3,
        trendMatch: 3,
        sentiment: "neutral",
      },
    });
    return { state: r.state, result: r.post };
  }, vaultRoot(values));
  if (values.json) process.stdout.write(`${JSON.stringify(post, null, 2)}\n`);
  else process.stdout.write(`Created ${post.id} ${post.title}\n`);
  return 0;
}

async function show(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const id = positionals[0];
  if (!id) fail("Provide a post id.");
  const state = await loadWorkspace(vaultRoot(values));
  const post = state.posts.find((p) => p.id === id);
  if (!post) fail(`No post ${id}.`);
  const score = scoreLive(post) ?? scoreIntrinsic(post);
  if (values.json) {
    process.stdout.write(
      `${JSON.stringify({ post, score }, null, 2)}\n`,
    );
    return 0;
  }
  const band = describeBand(score.band);
  process.stdout.write(
    [
      `${post.title}`,
      `id          ${post.id}`,
      `platform    ${post.platform}`,
      `format      ${post.content.format}`,
      `status      ${post.status}`,
      `score       ${score.value.toFixed(1)} (${band.label})`,
      `confidence  ${(score.confidence * 100).toFixed(0)}%`,
      `snapshots   ${post.snapshots.length}`,
      ``,
      `hook        ${post.content.hook || "—"}`,
      `caption     ${post.content.caption || "—"}`,
      `hashtags    ${post.content.hashtags.map((h) => `#${h}`).join(" ") || "—"}`,
    ].join("\n") + "\n",
  );
  return 0;
}

async function score(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const id = positionals[0];
  if (!id) fail("Provide a post id.");
  const state = await loadWorkspace(vaultRoot(values));
  const post = state.posts.find((p) => p.id === id);
  if (!post) fail(`No post ${id}.`);
  const result = scoreLive(post) ?? scoreIntrinsic(post);
  if (values.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  const band = describeBand(result.band);
  process.stdout.write(
    `${result.value.toFixed(1)} / 100 — ${band.label} (confidence ${(result.confidence * 100).toFixed(0)}%)\n\n`,
  );
  for (const f of [...result.factors].sort(
    (a, b) => b.contribution - a.contribution,
  )) {
    process.stdout.write(
      `${f.contribution >= 0 ? "+" : ""}${f.contribution.toFixed(1).padStart(6)}  ${f.label}\n`,
    );
  }
  return 0;
}

async function recommendCmd(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const id = positionals[0];
  if (!id) fail("Provide a post id.");
  const state = await loadWorkspace(vaultRoot(values));
  const post = state.posts.find((p) => p.id === id);
  if (!post) fail(`No post ${id}.`);
  const recs = recommend(post);
  if (values.json) {
    process.stdout.write(`${JSON.stringify(recs, null, 2)}\n`);
    return 0;
  }
  if (recs.length === 0) {
    process.stdout.write("No obvious wins. Every factor is strong.\n");
    return 0;
  }
  for (const r of recs) {
    process.stdout.write(`+${r.potentialGain.toFixed(1)}  ${r.label}: ${r.message}\n`);
  }
  return 0;
}

async function snap(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs<{
    at?: string;
    impressions?: string;
    views?: string;
    likes?: string;
    comments?: string;
    shares?: string;
    saves?: string;
    retention?: string;
    watch?: string;
  }>(argv, {
    at: { type: "string" },
    impressions: { type: "string" },
    views: { type: "string" },
    likes: { type: "string" },
    comments: { type: "string" },
    shares: { type: "string" },
    saves: { type: "string" },
    retention: { type: "string" },
    watch: { type: "string" },
  });
  const id = positionals[0];
  if (!id) fail("Provide a post id.");
  if (!values.at) fail("Provide --at=<minutes since launch>.");

  // Numeric coercion at the CLI boundary. Without this, `--at=foo` would
  // sail past `Number(...)` as NaN, JSON-serialize as null on disk, and
  // crash scoreLive later. nonneg() also rejects negatives + infinities.
  const atMinutes = nonneg(values.at, "at");
  const snapshot = await withWorkspace((s) => {
    const post = s.posts.find((p) => p.id === id);
    if (!post) fail(`No post ${id}.`);
    const r = addSnapshot(s, id, {
      atMinutes,
      impressions: nonneg(values.impressions ?? "0", "impressions"),
      views: nonneg(values.views ?? "0", "views"),
      likes: nonneg(values.likes ?? "0", "likes"),
      comments: nonneg(values.comments ?? "0", "comments"),
      shares: nonneg(values.shares ?? "0", "shares"),
      saves: nonneg(values.saves ?? "0", "saves"),
      retentionPct:
        values.retention !== undefined
          ? bounded(values.retention, "retention", 0, 100)
          : undefined,
      watchTimeAvgSec:
        values.watch !== undefined ? nonneg(values.watch, "watch") : undefined,
    });
    return { state: r.state, result: r.snapshot };
  }, vaultRoot(values));

  if (values.json) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  } else {
    process.stdout.write(`Snapshot recorded at T+${snapshot.atMinutes}m.\n`);
  }
  return 0;
}

async function variant(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs(argv, {});
  const id = positionals[0];
  if (!id) fail("Provide a post id.");
  const post = await withWorkspace((s) => {
    const r = duplicatePost(s, id);
    if (!r.post) fail(`No post ${id}.`);
    return { state: r.state, result: r.post as Post };
  }, vaultRoot(values));
  if (values.json) {
    process.stdout.write(`${JSON.stringify(post, null, 2)}\n`);
  } else {
    process.stdout.write(`Variant created: ${post.id}\n`);
  }
  return 0;
}

async function setFields(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs<{
    title?: string;
    status?: string;
    hook?: string;
    caption?: string;
    duration?: string;
  }>(argv, {
    title: { type: "string" },
    status: { type: "string" },
    hook: { type: "string" },
    caption: { type: "string" },
    duration: { type: "string" },
  });
  const id = positionals[0];
  if (!id) fail("Provide a post id.");
  await withWorkspace((s) => {
    const post = s.posts.find((p) => p.id === id);
    if (!post) fail(`No post ${id}.`);
    return {
      state: updatePost(s, id, {
        title: values.title,
        status: values.status as PostStatus | undefined,
        content: {
          ...post.content,
          ...(values.hook !== undefined ? { hook: values.hook } : {}),
          ...(values.caption !== undefined ? { caption: values.caption } : {}),
          ...(values.duration !== undefined
            ? { durationSec: Number(values.duration) }
            : {}),
        },
      }),
      result: undefined,
    };
  }, vaultRoot(values));
  process.stdout.write("Updated.\n");
  return 0;
}
