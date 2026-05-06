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
  nextTaskNumber: number; // monotonic per-project counter
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

// ── Virality / Posts ─────────────────────────────────────────────────────────

export type Platform =
  | "tiktok"
  | "reels"
  | "shorts"
  | "x"
  | "instagram_feed"
  | "linkedin"
  | "threads"
  | "facebook";

export type PostFormat =
  | "video"
  | "image"
  | "carousel"
  | "text"
  | "live";

export type PostStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "analyzing"
  | "archived";

export type ScoreBand = "flop" | "meh" | "solid" | "hot" | "rocket";

export interface PostContent {
  hook: string;
  caption: string;
  hashtags: string[];
  transcript: string;
  format: PostFormat;
  durationSec?: number; // video length
  hasTrendingAudio: boolean;
}

export interface PostContext {
  audienceSize: number; // followers/subscribers
  accountAvgViews: number; // recent baseline
  postingHour: number; // 0-23 local hour
  dayOfWeek: number; // 0-6, sun=0
  topicCategory: string;
  novelty: 1 | 2 | 3 | 4 | 5;
  emotion: 1 | 2 | 3 | 4 | 5;
  trendMatch: 1 | 2 | 3 | 4 | 5;
  sentiment: "negative" | "neutral" | "positive" | "controversial";
}

export interface EngagementSnapshot {
  id: string;
  capturedAt: string;
  atMinutes: number; // since post launch
  impressions: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watchTimeAvgSec?: number;
  retentionPct?: number; // 0-100
}

export interface ScoreFactor {
  id: string;
  label: string;
  group: "content" | "context" | "traction" | "diffusion";
  raw: number; // 0..1 quality score for this dimension
  weight: number; // 0..1 importance for the platform
  contribution: number; // raw * weight * 100
  hint: string;
}

export interface ViralityScore {
  value: number; // 0..100
  band: ScoreBand;
  confidence: number; // 0..1
  factors: ScoreFactor[];
  computedAt: string;
}

export interface ViralityThreshold {
  metric: "views" | "shares" | "engagement_rate";
  value: number;
  window: "24h" | "7d" | "30d";
}

export interface Post {
  id: string;
  projectId?: string;
  title: string;
  content: PostContent;
  context: PostContext;
  platform: Platform;
  status: PostStatus;
  scheduledAt?: string;
  postedAt?: string;
  threshold: ViralityThreshold;
  snapshots: EngagementSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export const PLATFORMS: { id: Platform; label: string; short: string }[] = [
  { id: "tiktok", label: "TikTok", short: "TT" },
  { id: "reels", label: "Instagram Reels", short: "RL" },
  { id: "shorts", label: "YouTube Shorts", short: "YS" },
  { id: "instagram_feed", label: "Instagram Feed", short: "IG" },
  { id: "x", label: "X / Twitter", short: "X" },
  { id: "threads", label: "Threads", short: "TH" },
  { id: "linkedin", label: "LinkedIn", short: "LI" },
  { id: "facebook", label: "Facebook", short: "FB" },
];

export const POST_FORMATS: { id: PostFormat; label: string }[] = [
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
  { id: "carousel", label: "Carousel" },
  { id: "text", label: "Text" },
  { id: "live", label: "Live" },
];

export const SCORE_BANDS: { id: ScoreBand; label: string; min: number }[] = [
  { id: "flop", label: "Flop risk", min: 0 },
  { id: "meh", label: "Meh", min: 35 },
  { id: "solid", label: "Solid", min: 55 },
  { id: "hot", label: "Hot", min: 75 },
  { id: "rocket", label: "Rocket", min: 88 },
];
