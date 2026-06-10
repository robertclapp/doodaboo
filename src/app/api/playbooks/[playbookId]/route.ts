import { ApiError, handle, json, mutateWorkspace, safeJson } from "@/lib/api";
import { applyPlaybook, getPlaybook } from "@/lib/playbooks";
import { updatePost } from "@/lib/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ playbookId: string }>;
}

export async function GET(_: Request, ctx: Params): Promise<Response> {
  return handle(async () => {
    const { playbookId } = await ctx.params;
    const pb = getPlaybook(playbookId);
    if (!pb) throw new ApiError(404, "Playbook not found");
    return json(pb);
  });
}

export async function POST(req: Request, ctx: Params): Promise<Response> {
  // POST /api/playbooks/:id { postId } applies the playbook to the post.
  return handle(async () => {
    const { playbookId } = await ctx.params;
    const pb = getPlaybook(playbookId);
    if (!pb) throw new ApiError(404, "Playbook not found");
    const body = await safeJson<{ postId: string }>(req);
    if (!body.postId) throw new ApiError(400, "postId is required");
    const result = await mutateWorkspace((s) => {
      const post = s.posts.find((p) => p.id === body.postId);
      if (!post) throw new ApiError(404, "Post not found");
      const { patch, changes } = applyPlaybook(post, pb);
      return {
        state: updatePost(s, post.id, { ...patch, playbookId: pb.id }),
        result: { changes, postId: post.id, playbookId: pb.id },
      };
    });
    return json(result);
  });
}
