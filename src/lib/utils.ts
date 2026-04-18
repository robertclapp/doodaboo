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
