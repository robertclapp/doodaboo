import { handle, json, mutateWorkspace, readWorkspace, safeJson } from "@/lib/api";
import { createProject } from "@/lib/mutations";
import { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => json((await readWorkspace()).projects));
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await safeJson<Partial<Project> & { name: string; key: string }>(req);
    if (!body.name || !body.key) {
      return json({ error: "name and key are required" }, { status: 400 });
    }
    const project = await mutateWorkspace((s) => {
      const r = createProject(s, body);
      return { state: r.state, result: r.project };
    });
    return json(project, { status: 201 });
  });
}
