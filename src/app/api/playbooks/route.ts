import { handle, json } from "@/lib/api";
import { PLAYBOOKS } from "@/lib/playbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => json(PLAYBOOKS));
}
