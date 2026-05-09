import { handle, json, readWorkspace, ApiError } from "@/lib/api";
import {
  projectThreshold,
  recommend,
  scoreIntrinsic,
  scoreLive,
} from "@/lib/virality";

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

    const intrinsic = scoreIntrinsic(post);
    const live = scoreLive(post);
    const projection = projectThreshold(post);
    const recommendations = recommend(post);

    return json({ intrinsic, live, projection, recommendations });
  });
}
