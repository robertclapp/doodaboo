import { handle, json, mutateWorkspace, readWorkspace, safeJson, ApiError } from "@/lib/api";
import { createPost } from "@/lib/mutations";
import { Post } from "@/lib/types";
import { scoreIntrinsic, scoreLive } from "@/lib/virality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const url = new URL(req.url);
    const platform = url.searchParams.get("platform");
    const status = url.searchParams.get("status");
    const withScore = url.searchParams.get("score") === "1";
    const state = await readWorkspace();
    const posts = state.posts
      .filter((p) => !platform || p.platform === platform)
      .filter((p) => !status || p.status === status);
    if (!withScore) return json(posts);
    return json(
      posts.map((p) => ({
        ...p,
        intrinsic: scoreIntrinsic(p),
        live: scoreLive(p),
      })),
    );
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await safeJson<Partial<Post> & { title: string; platform: Post["platform"] }>(req);
    if (!body.title || !body.platform) {
      throw new ApiError(400, "title and platform are required");
    }
    const post = await mutateWorkspace((s) => {
      const r = createPost(s, body);
      return { state: r.state, result: r.post };
    });
    return json(post, { status: 201 });
  });
}
