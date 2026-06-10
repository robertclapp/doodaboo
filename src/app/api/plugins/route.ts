import { handle, json } from "@/lib/api";
import { inventory } from "@/lib/plugins/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => json(await inventory()));
}
