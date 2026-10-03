"use client";

import { ConvexError } from "convex/values";
import type { ConvexReactClient } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  drawSeed,
  OpError,
  runOp,
  seededContext,
  type Deleted,
  type Op,
  type TrashLookup,
} from "./ops";
import type { CloudBridge, CloudView, ExportPayload } from "./store";
import { useStore } from "./store";
import type { ProjectSnapshot } from "./mutations";
import type { Post, Task } from "./types";

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
  const trashed = {
    project: new Map<string, ProjectSnapshot>(),
    task: new Map<string, Task>(),
    post: new Map<string, Post>(),
  };
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

  return {
    workspaceId,
    workspaceName: opts.workspaceName,
    role: opts.role,
    account: opts.account,
    switchWorkspace: opts.switchWorkspace,
    signOut: opts.signOut,

    apply(op: Op): unknown {
      const seed = drawSeed();
      const mirror = useStore.getState();
      const actor = mirror.currentUserId;
      // 1. Local result for the caller. A stale target throws here, before
      //    anything is sent — the UI gets the same error it would from the
      //    server, just sooner.
      const local = runOp(mirror, op, seededContext(seed, { actorId: actor, trash }));
      remember(local.deleted);

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
                // Leave the cached view alone; the server's answer decides.
              }
            },
          },
        )
        .catch((err: unknown) => {
          opts.notify(messageOf(err));
        });

      return local.result;
    },

    async replaceContent(payload: ExportPayload): Promise<void> {
      await client.mutation(api.workspace.replaceContent, {
        workspaceId,
        content: {
          labels: payload.labels,
          projects: payload.projects,
          tasks: payload.tasks,
          posts: payload.posts ?? [],
        },
        fromUserId: payload.currentUserId,
      });
    },
  };
}

/** A readable message for any failure the cloud layer can produce. */
export function messageOf(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | string;
    if (typeof data === "string") return data;
    if (data && typeof data.message === "string") return data.message;
  }
  if (err instanceof OpError) return err.message;
  if (err instanceof Error) {
    // Convex wraps server errors as "[Request ID: …] Server Error: …".
    const m = /Uncaught (?:ConvexError|Error): (.*?)(?:\n|$)/.exec(err.message);
    if (m) return m[1];
    return err.message.replace(/^\[Request ID: [^\]]+\]\s*/, "");
  }
  return "Something went wrong";
}
