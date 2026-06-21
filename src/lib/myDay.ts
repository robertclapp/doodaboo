import { Status, Task } from "./types";
import { priorityRank } from "./utils";

/**
 * Statuses that count as "active work for me" — the set the CLI dash uses
 * to build its MY DAY list and the same set the web home uses to surface a
 * priority-then-due single-next-action queue.
 *
 * Intentionally excludes `backlog`, `done`, and `cancelled`: backlog is
 * deferred (not "today"), and the other two aren't actionable.
 */
export const MY_DAY_STATUSES: ReadonlySet<Status> = new Set<Status>([
  "todo",
  "in_progress",
  "in_review",
]);

/** Default cap — small on purpose to fight overwhelm. */
export const MY_DAY_LIMIT = 5;

/**
 * Build the "My Day" list: tasks the current user owns that are actively
 * in flight, sorted by priority first and then by due date (sooner first;
 * tasks with no due date sink to the bottom of their priority bucket),
 * capped at `limit`.
 *
 * Pure and deterministic given the same inputs — both the CLI dash and
 * the web home consume this. Each surface adorns the result with its own
 * display fields (project key, formatted due, etc).
 */
export function buildMyDay(
  tasks: Task[],
  currentUserId: string | undefined,
  limit: number = MY_DAY_LIMIT,
): Task[] {
  if (!currentUserId) return [];
  const mine = tasks.filter(
    (t) => t.assigneeId === currentUserId && MY_DAY_STATUSES.has(t.status),
  );
  mine.sort((a, b) => {
    const pa = priorityRank(a.priority);
    const pb = priorityRank(b.priority);
    if (pa !== pb) return pa - pb;
    // Sooner due date first; missing due dates rank last within the bucket.
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    return da - db;
  });
  return mine.slice(0, Math.max(0, limit));
}
