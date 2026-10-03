import { v, type Infer } from "convex/values";

/**
 * Convex validators mirroring src/lib/types.ts.
 *
 * Two families:
 *   - `*Doc`: the stored shape of a record (what src/lib/types.ts declares,
 *     minus nothing) — used by the schema and by replaceContent/create.
 *   - `op`: the operation protocol (src/lib/ops.ts). Patches enumerate the
 *     fields a client may set; `comments`, `activity` and `snapshots` are
 *     deliberately absent so attribution can only come from the server's
 *     view of who is calling. Convex object validators reject unknown fields.
 */

export const status = v.union(
  v.literal("backlog"),
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("in_review"),
  v.literal("done"),
  v.literal("cancelled"),
);

export const priority = v.union(
  v.literal("none"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);

export const taskType = v.union(v.literal("task"), v.literal("issue"));

export const platform = v.union(
  v.literal("tiktok"),
  v.literal("reels"),
  v.literal("shorts"),
  v.literal("x"),
  v.literal("instagram_feed"),
  v.literal("linkedin"),
  v.literal("threads"),
  v.literal("facebook"),
);

export const postFormat = v.union(
  v.literal("video"),
  v.literal("image"),
  v.literal("carousel"),
  v.literal("text"),
  v.literal("live"),
);

export const postStatus = v.union(
  v.literal("draft"),
  v.literal("scheduled"),
  v.literal("live"),
  v.literal("analyzing"),
  v.literal("archived"),
);

const rating = v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5));

export const postContent = v.object({
  hook: v.string(),
  caption: v.string(),
  hashtags: v.array(v.string()),
  transcript: v.string(),
  format: postFormat,
  durationSec: v.optional(v.number()),
  hasTrendingAudio: v.boolean(),
});

export const postContext = v.object({
  audienceSize: v.number(),
  accountAvgViews: v.number(),
  postingHour: v.number(),
  dayOfWeek: v.number(),
  topicCategory: v.string(),
  novelty: rating,
  emotion: rating,
  trendMatch: rating,
  sentiment: v.union(
    v.literal("negative"),
    v.literal("neutral"),
    v.literal("positive"),
    v.literal("controversial"),
  ),
});

export const threshold = v.object({
  metric: v.union(v.literal("views"), v.literal("shares"), v.literal("engagement_rate")),
  value: v.number(),
  window: v.union(v.literal("24h"), v.literal("7d"), v.literal("30d")),
});

const snapshotFields = {
  atMinutes: v.number(),
  impressions: v.number(),
  views: v.number(),
  likes: v.number(),
  comments: v.number(),
  shares: v.number(),
  saves: v.number(),
  watchTimeAvgSec: v.optional(v.number()),
  retentionPct: v.optional(v.number()),
};

export const snapshotInput = v.object(snapshotFields);
export const snapshot = v.object({ id: v.string(), capturedAt: v.string(), ...snapshotFields });

export const comment = v.object({
  id: v.string(),
  authorId: v.string(),
  body: v.string(),
  createdAt: v.string(),
});

export const activityEntry = v.object({
  id: v.string(),
  at: v.string(),
  authorId: v.optional(v.string()),
  message: v.string(),
});

// ── Stored documents ────────────────────────────────────────────────────────

export const labelDoc = {
  id: v.string(),
  name: v.string(),
  color: v.string(),
};

export const projectDoc = {
  id: v.string(),
  key: v.string(),
  name: v.string(),
  description: v.string(),
  status,
  priority,
  leadId: v.optional(v.string()),
  memberIds: v.array(v.string()),
  targetDate: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  icon: v.optional(v.string()),
  accent: v.optional(v.string()),
  nextTaskNumber: v.number(),
};

export const taskDoc = {
  id: v.string(),
  projectId: v.string(),
  number: v.number(),
  type: taskType,
  title: v.string(),
  description: v.string(),
  status,
  priority,
  assigneeId: v.optional(v.string()),
  labelIds: v.array(v.string()),
  dueDate: v.optional(v.string()),
  estimate: v.optional(v.number()),
  createdAt: v.string(),
  updatedAt: v.string(),
  comments: v.array(comment),
  activity: v.array(activityEntry),
};

export const postDoc = {
  id: v.string(),
  projectId: v.optional(v.string()),
  title: v.string(),
  content: postContent,
  context: postContext,
  platform,
  status: postStatus,
  scheduledAt: v.optional(v.string()),
  postedAt: v.optional(v.string()),
  threshold,
  snapshots: v.array(snapshot),
  playbookId: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
};

/** Full record validators, for import/replace payloads. */
export const labelRecord = v.object(labelDoc);
export const projectRecord = v.object(projectDoc);
export const taskRecord = v.object(taskDoc);
export const postRecord = v.object(postDoc);

export const content = v.object({
  labels: v.array(labelRecord),
  projects: v.array(projectRecord),
  tasks: v.array(taskRecord),
  posts: v.array(postRecord),
});
export type Content = Infer<typeof content>;

// ── Operation protocol ──────────────────────────────────────────────────────

// Clearing a field travels as a key in `unset` (src/lib/ops.ts), never as
// null or undefined inside the patch — Convex drops undefined properties on
// the wire and the stored schema has no nulls.
const unset = v.optional(v.array(v.string()));

export const projectPatch = v.object({
  key: v.optional(v.string()),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.optional(status),
  priority: v.optional(priority),
  leadId: v.optional(v.string()),
  memberIds: v.optional(v.array(v.string())),
  targetDate: v.optional(v.string()),
  icon: v.optional(v.string()),
  accent: v.optional(v.string()),
});

export const taskPatch = v.object({
  type: v.optional(taskType),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.optional(status),
  priority: v.optional(priority),
  assigneeId: v.optional(v.string()),
  labelIds: v.optional(v.array(v.string())),
  dueDate: v.optional(v.string()),
  estimate: v.optional(v.number()),
});

export const postPatch = v.object({
  projectId: v.optional(v.string()),
  title: v.optional(v.string()),
  content: v.optional(postContent),
  context: v.optional(postContext),
  platform: v.optional(platform),
  status: v.optional(postStatus),
  scheduledAt: v.optional(v.string()),
  postedAt: v.optional(v.string()),
  threshold: v.optional(threshold),
  playbookId: v.optional(v.string()),
});

export const op = v.union(
  v.object({ type: v.literal("addLabel"), data: v.object({ name: v.string(), color: v.string() }) }),
  v.object({ type: v.literal("removeLabel"), id: v.string() }),
  v.object({
    type: v.literal("createProject"),
    data: v.object({
      name: v.string(),
      key: v.string(),
      description: v.optional(v.string()),
      status: v.optional(status),
      priority: v.optional(priority),
      leadId: v.optional(v.string()),
      memberIds: v.optional(v.array(v.string())),
      targetDate: v.optional(v.string()),
      icon: v.optional(v.string()),
      accent: v.optional(v.string()),
    }),
  }),
  v.object({ type: v.literal("updateProject"), id: v.string(), patch: projectPatch, unset }),
  v.object({ type: v.literal("deleteProject"), id: v.string() }),
  v.object({ type: v.literal("restoreProject"), id: v.string() }),
  v.object({
    type: v.literal("createTask"),
    data: v.object({
      projectId: v.string(),
      title: v.string(),
      type: v.optional(taskType),
      description: v.optional(v.string()),
      status: v.optional(status),
      priority: v.optional(priority),
      assigneeId: v.optional(v.string()),
      labelIds: v.optional(v.array(v.string())),
      dueDate: v.optional(v.string()),
      estimate: v.optional(v.number()),
    }),
  }),
  v.object({ type: v.literal("updateTask"), id: v.string(), patch: taskPatch, unset }),
  v.object({ type: v.literal("deleteTask"), id: v.string() }),
  v.object({ type: v.literal("restoreTask"), id: v.string() }),
  v.object({ type: v.literal("moveTaskStatus"), id: v.string(), status }),
  v.object({ type: v.literal("addComment"), taskId: v.string(), body: v.string() }),
  v.object({
    type: v.literal("createPost"),
    data: v.object({
      title: v.string(),
      platform,
      projectId: v.optional(v.string()),
      content: v.optional(postContent),
      context: v.optional(postContext),
      status: v.optional(postStatus),
      scheduledAt: v.optional(v.string()),
      postedAt: v.optional(v.string()),
      threshold: v.optional(threshold),
      playbookId: v.optional(v.string()),
    }),
  }),
  v.object({ type: v.literal("updatePost"), id: v.string(), patch: postPatch, unset }),
  v.object({ type: v.literal("deletePost"), id: v.string() }),
  v.object({ type: v.literal("restorePost"), id: v.string() }),
  v.object({ type: v.literal("duplicatePost"), id: v.string(), titleSuffix: v.optional(v.string()) }),
  v.object({ type: v.literal("addSnapshot"), postId: v.string(), snapshot: snapshotInput }),
  v.object({ type: v.literal("removeSnapshot"), postId: v.string(), snapshotId: v.string() }),
);
export type WireOp = Infer<typeof op>;

export const seed = v.object({
  ids: v.array(v.string()),
  now: v.string(),
});
