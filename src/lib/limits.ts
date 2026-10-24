import { getConvexSize, type Value } from "convex/values";
import type { Label, Post, Project, Task } from "./types";

/**
 * Size limits for cloud workspaces.
 *
 * Local mode has none — it is one person's data on one device. A cloud
 * workspace is shared, and it is served to every member through one reactive
 * query, so one member's oversized records would otherwise cost everyone
 * (and, past Convex's per-function read limit, make the workspace fail to
 * load). These caps are generous for real use: a seed task is ~450 bytes,
 * a seed post ~1.4 KB.
 *
 * Enforced on the server for every record a write produces
 * (convex/lib.ts writeDiff, convex/workspace.ts imports), and checked in the
 * browser before an op is sent (src/lib/cloud-bridge.ts) so the user gets
 * the message immediately instead of watching an optimistic edit vanish.
 */
export const LIMITS = {
  idLength: 64,
  label: { name: 60, color: 32 },
  project: { key: 12, name: 120, description: 10_000, icon: 8, accent: 32, memberIds: 500 },
  task: { title: 300, description: 20_000, labelIds: 50, comments: 500, commentBody: 5_000 },
  post: {
    title: 300,
    hook: 1_000,
    caption: 5_000,
    transcript: 30_000,
    hashtags: 60,
    hashtag: 100,
    topicCategory: 100,
    snapshots: 500,
  },
  /** Per stored record, measured the way Convex measures documents. Convex itself caps documents at 1 MiB. */
  recordBytes: 256 * 1024,
} as const;

export type RecordKind = "labels" | "projects" | "tasks" | "posts";

const KIND_NAME: Record<RecordKind, string> = {
  labels: "label",
  projects: "project",
  tasks: "issue",
  posts: "post",
};

function tooLong(what: string, value: string | undefined, max: number): string | null {
  return value !== undefined && value.length > max ? `${what} is too long (${value.length} characters; the limit is ${max})` : null;
}

function tooMany(what: string, list: readonly unknown[] | undefined, max: number): string | null {
  return list && list.length > max ? `${what}: ${list.length} is more than the limit of ${max}` : null;
}

/**
 * The first limit `record` breaks, as a sentence for the user, or null.
 * `kind` names the collection the record is stored in.
 */
export function checkRecord(kind: RecordKind, record: Label | Project | Task | Post): string | null {
  const name = KIND_NAME[kind];
  const problems: (string | null)[] = [tooLong(`The ${name} id`, record.id, LIMITS.idLength)];
  switch (kind) {
    case "labels": {
      const l = record as Label;
      problems.push(tooLong("The label name", l.name, LIMITS.label.name), tooLong("The label color", l.color, LIMITS.label.color));
      break;
    }
    case "projects": {
      const p = record as Project;
      problems.push(
        tooLong("The project key", p.key, LIMITS.project.key),
        tooLong("The project name", p.name, LIMITS.project.name),
        tooLong("The project description", p.description, LIMITS.project.description),
        tooLong("The project icon", p.icon, LIMITS.project.icon),
        tooLong("The project color", p.accent, LIMITS.project.accent),
        tooMany("Project members", p.memberIds, LIMITS.project.memberIds),
      );
      break;
    }
    case "tasks": {
      const t = record as Task;
      problems.push(
        tooLong("The title", t.title, LIMITS.task.title),
        tooLong("The description", t.description, LIMITS.task.description),
        tooMany("Labels on this issue", t.labelIds, LIMITS.task.labelIds),
        tooMany("Comments on this issue", t.comments, LIMITS.task.comments),
        ...t.comments.map((c) => tooLong("A comment", c.body, LIMITS.task.commentBody)),
      );
      break;
    }
    case "posts": {
      const p = record as Post;
      problems.push(
        tooLong("The post title", p.title, LIMITS.post.title),
        tooLong("The hook", p.content.hook, LIMITS.post.hook),
        tooLong("The caption", p.content.caption, LIMITS.post.caption),
        tooLong("The transcript", p.content.transcript, LIMITS.post.transcript),
        tooMany("Hashtags", p.content.hashtags, LIMITS.post.hashtags),
        ...p.content.hashtags.map((h) => tooLong("A hashtag", h, LIMITS.post.hashtag)),
        tooLong("The topic", p.context.topicCategory, LIMITS.post.topicCategory),
        tooMany("Snapshots on this post", p.snapshots, LIMITS.post.snapshots),
      );
      break;
    }
  }
  const first = problems.find((p): p is string => p !== null);
  if (first) return first;
  const bytes = recordBytes(record);
  if (bytes > LIMITS.recordBytes) {
    return `This ${name} is too large to store (${Math.round(bytes / 1024)} KB; the limit is ${LIMITS.recordBytes / 1024} KB)`;
  }
  return null;
}

/** Size in bytes as Convex counts it (the same formula its read and document limits use). */
export function recordBytes(record: object): number {
  return getConvexSize(record as unknown as Value);
}
