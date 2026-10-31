import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Deleted records stay restorable for a week (workspace.ts TRASH_TTL_DAYS).
crons.daily("purge trash", { hourUTC: 3, minuteUTC: 17 }, internal.workspace.purgeTrash, {});
// Invites are dead a week after creation (used or not); keep the table small.
crons.daily("purge invites", { hourUTC: 3, minuteUTC: 41 }, internal.members.purgeInvites, {});

export default crons;
