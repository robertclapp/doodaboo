import { handle, json, mutateWorkspace, readWorkspace, safeJson, ApiError } from "@/lib/api";
import { createTask } from "@/lib/mutations";
import { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const url = new URL(req.url);
    const project = url.searchParams.get("project");
    const status = url.searchParams.get("status");
    const assignee = url.searchParams.get("assignee");
    const state = await readWorkspace();
    const tasks = state.tasks
      .filter((t) => !project || t.projectId === project)
      .filter((t) => !status || t.status === status)
      .filter((t) => !assignee || t.assigneeId === assignee);
    return json(tasks);
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await safeJson<Partial<Task> & { projectId: string; title: string }>(req);
    if (!body.projectId || !body.title) {
      throw new ApiError(400, "projectId and title are required");
    }
    const task = await mutateWorkspace((s) => {
      const r = createTask(s, body);
      return { state: r.state, result: r.task };
    });
    return json(task, { status: 201 });
  });
}
