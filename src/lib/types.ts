export type TaskType = "task" | "issue";

export type Status =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "cancelled";

export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export const STATUSES: { id: Status; label: string; short: string }[] = [
  { id: "backlog", label: "Backlog", short: "BL" },
  { id: "todo", label: "Todo", short: "TD" },
  { id: "in_progress", label: "In Progress", short: "IP" },
  { id: "in_review", label: "In Review", short: "RV" },
  { id: "done", label: "Done", short: "DN" },
  { id: "cancelled", label: "Cancelled", short: "XX" },
];

export const PRIORITIES: { id: Priority; label: string; order: number }[] = [
  { id: "urgent", label: "Urgent", order: 0 },
  { id: "high", label: "High", order: 1 },
  { id: "medium", label: "Medium", order: 2 },
  { id: "low", label: "Low", order: 3 },
  { id: "none", label: "No priority", order: 4 },
];

export interface User {
  id: string;
  name: string;
  handle: string;
  color: string;
  role?: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Project {
  id: string;
  key: string; // e.g. "WEB"
  name: string;
  description: string;
  status: Status;
  priority: Priority;
  leadId?: string;
  memberIds: string[];
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
  icon?: string; // single char
  accent?: string; // hex
}

export interface Comment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  at: string;
  authorId?: string;
  message: string;
}

export interface Task {
  id: string;
  projectId: string;
  number: number; // per-project counter
  type: TaskType;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assigneeId?: string;
  labelIds: string[];
  dueDate?: string;
  estimate?: number; // points
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
  activity: ActivityEntry[];
}
