import {
  handle,
  json,
  mutateWorkspace,
  readWorkspace,
  safeJson,
  ApiError,
} from "@/lib/api";
import { deletePost, duplicatePost, updatePost } from "@/lib/mutations";
import { Post } from "@/lib/types";

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
    return json(post);
  });
}

export async function PATCH(req: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { postId } = await ctx.params;
    const patch = await safeJson<Partial<Post>>(req);
    const post = await mutateWorkspace((s) => {
      const exists = s.posts.find((p) => p.id === postId);
      if (!exists) throw new ApiError(404, "Post not found");
      const next = updatePost(s, postId, patch);
      return {
        state: next,
        result: next.posts.find((p) => p.id === postId)!,
      };
    });
    return json(post);
  });
}

export async function POST(_: Request, ctx: Params): Promise<Response> {
  // POST /api/posts/:id duplicates the post into a draft variant.
  return handle(async () => {
    const { postId } = await ctx.params;
    const post = await mutateWorkspace((s) => {
      const r = duplicatePost(s, postId);
      if (!r.post) throw new ApiError(404, "Post not found");
      return { state: r.state, result: r.post };
    });
    return json(post, { status: 201 });
  });
}

export async function DELETE(_: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { postId } = await ctx.params;
    await mutateWorkspace((s) => {
      const exists = s.posts.find((p) => p.id === postId);
      if (!exists) throw new ApiError(404, "Post not found");
      return { state: deletePost(s, postId), result: undefined };
    });
    return new Response(null, { status: 204 });
  });
}
