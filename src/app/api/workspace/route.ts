import { handle, json, readWorkspace, safeJson } from "@/lib/api";
import { saveWorkspace } from "@/lib/vault";
import { WorkspaceState, WORKSPACE_VERSION } from "@/lib/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => json(await readWorkspace()));
}

export async function PUT(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await safeJson<Partial<WorkspaceState>>(req);
    const state: WorkspaceState = {
      version: WORKSPACE_VERSION,
      theme: body.theme ?? "system",
      currentUserId: body.currentUserId ?? "u_unknown",
      users: body.users ?? [],
      labels: body.labels ?? [],
      projects: body.projects ?? [],
      tasks: body.tasks ?? [],
      posts: body.posts ?? [],
    };
    await saveWorkspace(state);
    return json(state);
  });
}
