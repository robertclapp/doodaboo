"use client";

import { ConvexError } from "convex/values";
import type { ConvexReactClient } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  drawSeed,
  OpError,
  OWNER_ONLY_OPS,
  runOp,
  seededContext,
  type Deleted,
  type Op,
  type OpResult,
  type TrashLookup,
} from "./ops";
import { normalizeContent } from "./normalize-content";
import type { CloudBridge, CloudView, ExportPayload } from "./store";
import { useStore } from "./store";
import type { ProjectSnapshot, WorkspaceState } from "./mutations";
import type { Label, Post, Project, Task } from "./types";
import { checkRecord, type RecordKind } from "./limits";

/**
 * The write path of cloud mode.
 *
 * `apply(op)` does three things, in this order:
 *   1. draws a seed (ids + wall-clock time) and runs the op against the
 *      store's current mirror so the caller gets its result (e.g. the new
 *      task, whose id the UI navigates to) synchronously;
 *   2. sends the mutation with a Convex optimistic update that runs the
 *      very same op, with the very same seed, over the cached
 *      `workspace.get` result — so the mirror (fed from that query) shows
 *      the change immediately and Convex rolls it back on rejection or
 *      replaces it with the server's copy on success;
 *   3. surfaces a rejection as a toast; nothing else is needed because the
 *      optimistic layer is already gone by then.
 *
 * Deletes remember what they removed so a later restore op can be applied
 * optimistically; the server restores from its own trash table.
 */
/**
 * Records deleted in this session, per workspace, so a restore can be shown
 * optimistically. Kept outside the bridge: the bridge is rebuilt when the
 * workspace is renamed or the user's role changes, and an Undo clicked
 * after that must still work. The server's trash is authoritative either
 * way; this is only the preview.
 */
const clientTrash = new Map<
  string,
  { project: Map<string, ProjectSnapshot>; task: Map<string, Task>; post: Map<string, Post> }
>();
function trashFor(workspaceId: string) {
  let t = clientTrash.get(workspaceId);
  if (!t) {
    t = { project: new Map(), task: new Map(), post: new Map() };
    clientTrash.set(workspaceId, t);
  }
  return t;
}

const RESTORE_OPS = new Set<Op["type"]>(["restoreProject", "restoreTask", "restorePost"]);

export function createCloudBridge(opts: {
  client: ConvexReactClient;
  workspaceId: Id<"workspaces">;
  workspaceName: string;
  role: "owner" | "member";
  account: { email: string | null; userId: string };
  notify: (message: string) => void;
  switchWorkspace: () => void;
  signOut: () => Promise<void>;
}): CloudBridge {
  const { client, workspaceId } = opts;
  const trashed = trashFor(workspaceId);
  const trash: TrashLookup = {
    project: (id) => trashed.project.get(id),
    task: (id) => trashed.task.get(id),
    post: (id) => trashed.post.get(id),
  };
  const remember = (d: Deleted | undefined) => {
    if (!d) return;
    if (d.kind === "project") trashed.project.set(d.snapshot.project.id, d.snapshot);
    else if (d.kind === "task") trashed.task.set(d.snapshot.id, d.snapshot);
    else trashed.post.set(d.snapshot.id, d.snapshot);
  };
  const refuse = (message: string, code: OpError["code"]): never => {
    opts.notify(message);
    throw new OpError(code, message);
  };

  return {
    workspaceId,
    workspaceName: opts.workspaceName,
    role: opts.role,
    account: opts.account,
    switchWorkspace: opts.switchWorkspace,
    signOut: opts.signOut,

    apply(op: Op): unknown {
      // The server enforces this too; refusing here means a member never
      // sees a delete "succeed", offer Undo, and then revert.
      if (OWNER_ONLY_OPS.has(op.type) && opts.role !== "owner") {
        refuse("Only a workspace owner can do that", "Forbidden");
      }
      const seed = drawSeed();
      const mirror = useStore.getState();
      const actor = mirror.currentUserId;

      // 1. Local result for the caller. Any failure is reported, then
      //    thrown, so a caller that expects a record never gets undefined.
      //    The one exception: a restore whose snapshot this tab does not
      //    hold (deleted elsewhere, or before a reload) — the server's trash
      //    has it, so send without a preview.
      let local: OpResult | null = null;
      try {
        local = runOp(mirror, op, seededContext(seed, { actorId: actor, trash }));
      } catch (err) {
        const missingPreview = RESTORE_OPS.has(op.type) && err instanceof OpError && err.code === "NotFound";
        if (!missingPreview) refuse(messageOf(err), err instanceof OpError ? err.code : "Validation");
      }
      if (local) {
        // The server refuses records over the cloud size limits; say so now
        // rather than letting the optimistic edit appear and then vanish.
        const problem = firstLimitProblem(mirror, local.state);
        if (problem) refuse(problem, "Validation");
        remember(local.deleted);
      }

      // 2. The mutation, with the identical op replayed optimistically.
      void client
        .mutation(
          api.workspace.apply,
          { workspaceId, op, seed },
          {
            optimisticUpdate: (store, args) => {
              const current = store.getQuery(api.workspace.get, { workspaceId }) as CloudView | null | undefined;
              if (!current) return;
              try {
                const r = runOp(current.state, args.op as Op, seededContext(args.seed, { actorId: actor, trash }));
                store.setQuery(api.workspace.get, { workspaceId }, { ...current, id: workspaceId, state: r.state });
              } catch {
                // No preview possible; the server's answer decides.
              }
            },
          },
        )
        .catch((err: unknown) => {
          opts.notify(messageOf(err));
        });

      return local?.result;
    },

    async replaceContent(payload: ExportPayload): Promise<void> {
      const content = normalizeContent(payload);
      await client.mutation(api.workspace.replaceContent, {
        workspaceId,
        content,
        ...(payload.currentUserId ? { fromUserId: payload.currentUserId } : {}),
      });
    },
  };
}

/**
 * A readable message for any failure the cloud layer can produce.
 *
 * ConvexError data always reaches the client and is the message to show.
 * Anything else arrives as "[CONVEX M(fn)] [Request ID: …] Server Error
 * … Called by client" — production redacts the detail — so strip the
 * transport framing, keep a developer message if one survived, and turn a
 * bare "Server Error" into a sentence.
 */
export function messageOf(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | string;
    if (typeof data === "string") return data;
    if (data && typeof data.message === "string") return data.message;
  }
  if (err instanceof OpError) return err.message;
  if (err instanceof Error) {
    const uncaught = /Uncaught (?:ConvexError|Error): (.*?)(?:\n|$)/.exec(err.message);
    if (uncaught) return uncaught[1];
    const text = err.message
      .replace(/^\[CONVEX [^\]]*\]\s*/, "")
      .replace(/^\[Request ID: [^\]]+\]\s*/, "")
      .replace(/\s*Called by client\s*$/, "")
      .trim();
    if (!text || /^Server Error\b/.test(text)) {
      return "The server could not complete that. Try again in a moment.";
    }
    return text;
  }
  return "Something went wrong";
}

/**
 * Check only the records an op produced or changed: the pure mutations
 * return untouched records by identity, so anything not `===` to its
 * counterpart in the mirror is new or edited.
 */
function firstLimitProblem(before: WorkspaceState, after: WorkspaceState): string | null {
  const kinds: RecordKind[] = ["labels", "projects", "tasks", "posts"];
  for (const kind of kinds) {
    const prev = new Map((before[kind] as { id: string }[]).map((r) => [r.id, r]));
    for (const r of after[kind] as (Label | Project | Task | Post)[]) {
      if (prev.get(r.id) === r) continue;
      const problem = checkRecord(kind, r);
      if (problem) return problem;
    }
  }
  return null;
}
