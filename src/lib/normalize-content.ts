import type { Label, Post, Project, Task } from "./types";
import type { ExportPayload } from "./store";

/** What the cloud's create / replaceContent accept. */
export interface Content {
  labels: Label[];
  projects: Project[];
  tasks: Task[];
  posts: Post[];
}

/**
 * Reshape a local workspace (or an export file) to exactly the fields the
 * cloud accepts, before uploading it.
 *
 * Local data is not always clean: the HTTP API's PATCH routes spread their
 * request body into the record, so a vault edited through `doodaboo serve`
 * can carry stray fields (`comment` from PATCH {comment}) and nulls
 * (`assigneeId: null` from an unassign). The server's validators are strict
 * — one stray field fails the whole upload — so keep only known keys and
 * drop null/undefined values. Values of the wrong type are left for the
 * server to reject with a precise message.
 */

const LABEL = ["id", "name", "color"] as const;
const PROJECT = [
  "id", "key", "name", "description", "status", "priority", "leadId", "memberIds",
  "targetDate", "createdAt", "updatedAt", "icon", "accent", "nextTaskNumber",
] as const;
const TASK = [
  "id", "projectId", "number", "type", "title", "description", "status", "priority",
  "assigneeId", "labelIds", "dueDate", "estimate", "createdAt", "updatedAt", "comments", "activity",
] as const;
const COMMENT = ["id", "authorId", "body", "createdAt"] as const;
const ACTIVITY = ["id", "at", "authorId", "message"] as const;
const POST = [
  "id", "projectId", "title", "content", "context", "platform", "status", "scheduledAt",
  "postedAt", "threshold", "snapshots", "playbookId", "createdAt", "updatedAt",
] as const;
const POST_CONTENT = ["hook", "caption", "hashtags", "transcript", "format", "durationSec", "hasTrendingAudio"] as const;
const POST_CONTEXT = [
  "audienceSize", "accountAvgViews", "postingHour", "dayOfWeek", "topicCategory",
  "novelty", "emotion", "trendMatch", "sentiment",
] as const;
const THRESHOLD = ["metric", "value", "window"] as const;
const SNAPSHOT = [
  "id", "capturedAt", "atMinutes", "impressions", "views", "likes", "comments",
  "shares", "saves", "watchTimeAvgSec", "retentionPct",
] as const;

type Obj = Record<string, unknown>;

function pick(value: unknown, keys: readonly string[]): Obj {
  const src = (value && typeof value === "object" ? value : {}) as Obj;
  const out: Obj = {};
  for (const k of keys) {
    const v = src[k];
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function normalizeContent(source: Pick<ExportPayload, "labels" | "projects" | "tasks"> & { posts?: unknown[] }): Content {
  return {
    labels: list(source.labels).map((l) => pick(l, LABEL)),
    projects: list(source.projects).map((p) => {
      const out = pick(p, PROJECT);
      out.memberIds = list(out.memberIds).filter((id) => typeof id === "string");
      return out;
    }),
    tasks: list(source.tasks).map((t) => {
      const out = pick(t, TASK);
      out.labelIds = list(out.labelIds).filter((id) => typeof id === "string");
      out.comments = list(out.comments).map((c) => pick(c, COMMENT));
      out.activity = list(out.activity).map((a) => pick(a, ACTIVITY));
      return out;
    }),
    posts: list(source.posts).map((p) => {
      const out = pick(p, POST);
      out.content = pick(out.content, POST_CONTENT);
      (out.content as Obj).hashtags = list((out.content as Obj).hashtags).filter((h) => typeof h === "string");
      out.context = pick(out.context, POST_CONTEXT);
      out.threshold = pick(out.threshold, THRESHOLD);
      out.snapshots = list(out.snapshots).map((s) => pick(s, SNAPSHOT));
      return out;
    }),
  } as unknown as Content;
}
