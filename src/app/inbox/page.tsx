"use client";

import { PageHeader } from "@/components/PageHeader";
import { TaskList } from "@/components/TaskList";
import { useStore } from "@/lib/store";

export default function InboxPage() {
  const tasks = useStore((s) => s.tasks);
  const currentUserId = useStore((s) => s.currentUserId);
  const hydrated = useStore((s) => s.hydrated);

  if (!hydrated) return null;

  const urgent = tasks.filter(
    (t) =>
      (t.assigneeId === currentUserId &&
        (t.priority === "urgent" || t.priority === "high") &&
        t.status !== "done" &&
        t.status !== "cancelled") ||
      (t.status === "in_review" && t.assigneeId === currentUserId),
  );

  return (
    <>
      <PageHeader
        kicker="Signal"
        title="Inbox"
      />
      <div className="border-b-[1.5px] border-ink px-4 py-3 text-xs text-ink/60">
        Urgent + high priority items assigned to you and anything in review.
      </div>
      <TaskList tasks={urgent} groupBy="priority" showProject />
    </>
  );
}
