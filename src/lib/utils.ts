import clsx, { ClassValue } from "clsx";
import { Priority, Status } from "./types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function statusColor(s: Status) {
  const map: Record<Status, string> = {
    backlog: "#737373",
    todo: "#a3a3a3",
    in_progress: "#f59e0b",
    in_review: "#6b4ee4",
    done: "#16a34a",
    cancelled: "#525252",
  };
  return map[s];
}

export function priorityColor(p: Priority) {
  const map: Record<Priority, string> = {
    urgent: "#dc2626",
    high: "#f97316",
    medium: "#eab308",
    low: "#3b82f6",
    none: "#737373",
  };
  return map[p];
}

export function priorityRank(p: Priority): number {
  const order: Record<Priority, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
    none: 4,
  };
  return order[p];
}

export function formatDateShort(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.round(diff / 1000);
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

export function slug(n: string) {
  return n
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

export type DueStatus = "overdue" | "today" | "soon" | "later" | "none";

export function dueStatus(iso?: string, now = Date.now()): DueStatus {
  if (!iso) return "none";
  const due = new Date(iso).getTime();
  // Derive the "today" window from `now`, not from a fresh `new Date()`.
  // The default `now` is the real clock, so production behavior is
  // unchanged — but passing an explicit `now` now fully determines the
  // classification, which keeps tests deterministic instead of coupling
  // them to the wall clock / a midnight rollover mid-run.
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;
  if (due < todayStart && now > due) return "overdue";
  if (due >= todayStart && due < todayEnd) return "today";
  if (due - now < 7 * 24 * 60 * 60 * 1000) return "soon";
  return "later";
}

// `<input type="date">` hands us a "YYYY-MM-DD" string that represents a
// calendar day in the user's timezone. `new Date("YYYY-MM-DD")` parses as
// UTC midnight, which shifts the calendar day for anyone west of UTC — so
// we parse/format at local midnight instead.
export function localDateInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d).toISOString();
}

export function isoToLocalDateInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
