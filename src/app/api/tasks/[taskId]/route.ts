import {
  handle,
  json,
  mutateWorkspace,
  readWorkspace,
  safeJson,
  ApiError,
} from "@/lib/api";
import { addComment, deleteTask, updateTask } from "@/lib/mutations";
import { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ taskId: string }>;
}

/**
 * Server-side actor for activity-log attribution. Falls back to the
 * workspace owner when the caller doesn't identify itself. When real
 * auth lands, this header gets replaced by a session lookup.
 */
function actorFrom(req: Request): { actorId?: string } {
  const id = req.headers.get("x-actor-id");
  return id ? { actorId: id } : {};
}

export async function GET(_: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { taskId } = await ctx.params;
    const state = await readWorkspace();
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) throw new ApiError(404, "Task not found");
    return json(task);
  });
}

export async function PATCH(req: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { taskId } = await ctx.params;
    const body = await safeJson<Partial<Task> & { comment?: string }>(req);
    const actor = actorFrom(req);
    const task = await mutateWorkspace((s) => {
      const exists = s.tasks.find((t) => t.id === taskId);
      if (!exists) throw new ApiError(404, "Task not found");
      let next = updateTask(s, taskId, body, actor);
      if (body.comment) {
        const r = addComment(next, taskId, body.comment, actor);
        next = r.state;
      }
      return {
        state: next,
        result: next.tasks.find((t) => t.id === taskId)!,
      };
    });
    return json(task);
  });
}

export async function DELETE(_: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { taskId } = await ctx.params;
    await mutateWorkspace((s) => {
      const exists = s.tasks.find((t) => t.id === taskId);
      if (!exists) throw new ApiError(404, "Task not found");
      return { state: deleteTask(s, taskId), result: undefined };
    });
    return new Response(null, { status: 204 });
  });
}
