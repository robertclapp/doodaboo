import {
  handle,
  json,
  mutateWorkspace,
  readWorkspace,
  safeJson,
  ApiError,
} from "@/lib/api";
import { deleteProject, updateProject } from "@/lib/mutations";
import { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

export async function GET(_: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { projectId } = await ctx.params;
    const state = await readWorkspace();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) throw new ApiError(404, "Project not found");
    const tasks = state.tasks.filter((t) => t.projectId === projectId);
    return json({ project, tasks });
  });
}

export async function PATCH(req: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { projectId } = await ctx.params;
    const patch = await safeJson<Partial<Project>>(req);
    const project = await mutateWorkspace((s) => {
      const exists = s.projects.find((p) => p.id === projectId);
      if (!exists) throw new ApiError(404, "Project not found");
      const next = updateProject(s, projectId, patch);
      return {
        state: next,
        result: next.projects.find((p) => p.id === projectId)!,
      };
    });
    return json(project);
  });
}

export async function DELETE(_: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { projectId } = await ctx.params;
    await mutateWorkspace((s) => {
      const exists = s.projects.find((p) => p.id === projectId);
      if (!exists) throw new ApiError(404, "Project not found");
      return { state: deleteProject(s, projectId), result: undefined };
    });
    return new Response(null, { status: 204 });
  });
}
