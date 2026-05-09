import {
  handle,
  json,
  mutateWorkspace,
  readWorkspace,
  safeJson,
  ApiError,
} from "@/lib/api";
import { addSnapshot } from "@/lib/mutations";
import { EngagementSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ postId: string }>;
}

export async function GET(_: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { postId } = await ctx.params;
    const state = await readWorkspace();
    const post = state.posts.find((p) => p.id === postId);
    if (!post) throw new ApiError(404, "Post not found");
    return json(post.snapshots);
  });
}

export async function POST(req: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { postId } = await ctx.params;
    const body = await safeJson<Omit<EngagementSnapshot, "id" | "capturedAt">>(req);
    if (typeof body.atMinutes !== "number") {
      throw new ApiError(400, "atMinutes is required");
    }
    const snapshot = await mutateWorkspace((s) => {
      const post = s.posts.find((p) => p.id === postId);
      if (!post) throw new ApiError(404, "Post not found");
      const r = addSnapshot(s, postId, body);
      return { state: r.state, result: r.snapshot };
    });
    return json(snapshot, { status: 201 });
  });
}
