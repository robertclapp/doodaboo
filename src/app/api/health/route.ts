import { ensureVault, json } from "@/lib/api";
import { defaultVaultRoot } from "@/lib/vault";
import { WORKSPACE_VERSION } from "@/lib/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const status = await ensureVault();
  return json({
    ok: status.ok,
    reason: status.reason,
    vault: defaultVaultRoot(),
    version: WORKSPACE_VERSION,
  });
}
