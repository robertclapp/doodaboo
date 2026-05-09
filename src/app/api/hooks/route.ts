import { ApiError, handle, json, safeJson } from "@/lib/api";
import { generateHooks, variantsForPlatform } from "@/lib/hooks-generator";
import { Platform } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GenerateRequest {
  subject: string;
  audience?: string;
  platform?: Platform | "all";
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await safeJson<GenerateRequest>(req);
    if (!body.subject) throw new ApiError(400, "subject is required");
    const variants = generateHooks({
      subject: body.subject,
      audience: body.audience,
    });
    return json(variantsForPlatform(variants, body.platform ?? "all"));
  });
}
