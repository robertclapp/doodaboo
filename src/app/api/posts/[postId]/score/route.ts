import { handle, json, readWorkspace, ApiError } from "@/lib/api";
import {
  projectThreshold,
  recommend,
  scoreIntrinsic,
  scoreLive,
} from "@/lib/virality";
import { loadPlugins } from "@/lib/plugins/loader";
import { pluginContributionToFactor } from "@/lib/plugins/types";
import type { ScoreFactor } from "@/lib/types";

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

    // Collect any plugin-provided score factors. Plugin failures are
    // isolated so a single broken plugin can't take down scoring.
    const extra: ScoreFactor[] = [];
    const plugins = await loadPlugins();
    for (const { plugin, ctx: pluginCtx } of plugins) {
      if (!plugin.scoreFactors) continue;
      try {
        const contributions = await plugin.scoreFactors(post, post.platform);
        for (const c of contributions) {
          extra.push(pluginContributionToFactor(c));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[doodaboo] plugin ${plugin.manifest.id} scoreFactors threw: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        pluginCtx.log("scoreFactors threw; skipping its contributions");
      }
    }

    const intrinsic = scoreIntrinsic(post, extra);
    const live = scoreLive(post, extra);
    const projection = projectThreshold(post);
    // Recommendations are computed against the same factor set the
    // response advertises, so users don't see suggestions for factors
    // that weren't actually scored.
    const recommendations = recommend(post, 4, extra);

    return json({ intrinsic, live, projection, recommendations });
  });
}
