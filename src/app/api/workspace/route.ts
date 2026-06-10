import { handle, json, readWorkspace, safeJson } from "@/lib/api";
import { migrate, saveWorkspace } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => json(await readWorkspace()));
}

export async function PUT(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await safeJson<unknown>(req);
    // Untrusted JSON. `migrate` is the trust boundary: it validates and
    // backfills nested shapes, rejects future-version payloads, and
    // returns a fully-formed WorkspaceState. Skipping it would let a
    // client wedge a workspace with missing arrays.
    const state = migrate(body);
    await saveWorkspace(state);
    return json(state);
  });
}
