import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Deleted records stay restorable for a week (workspace.ts TRASH_TTL_DAYS).
crons.daily("purge trash", { hourUTC: 3, minuteUTC: 17 }, internal.workspace.purgeTrash, {});

export default crons;
