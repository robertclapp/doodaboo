import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { as, fresh, seed, signUp, workspaceFor, type Account, type T } from "./test.helpers";
import type { WorkspaceView } from "./workspace";
import type { EngagementSnapshot, Label, Post, Project, Task } from "../src/lib/types";

const errorCode = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "none";
  } catch (e) {
    if (e instanceof ConvexError) return (e.data as { code: string }).code;
    throw e;
  }
};

const apply = (t: T, who: Account, ws: Id<"workspaces">, op: unknown) =>
  as(t, who).mutation(api.workspace.apply, { workspaceId: ws, op: op as never, seed: seed() });
const view = async (t: T, who: Account, ws: Id<"workspaces">) =>
  (await as(t, who).query(api.workspace.get, { workspaceId: ws })) as WorkspaceView;

async function team() {
  const t = fresh();
  const owner = await signUp(t, "owner@example.com");
  const member = await signUp(t, "member@example.com");
  const ws = await workspaceFor(t, owner);
  const { token } = (await as(t, owner).mutation(api.members.invite, { workspaceId: ws })) as { token: string };
  await as(t, member).mutation(api.members.acceptInvite, { token });
  return { t, owner, member, ws };
}

describe("ops without other server coverage", () => {
  it("updateProject sets fields and clears clearable ones", async () => {
    const { t, owner, member, ws } = await team();
    const project = (await apply(t, owner, ws, {
      type: "createProject",
      data: { name: "Web", key: "WEB", targetDate: "2026-12-01", leadId: member.userId },
    })) as Project;
    await apply(t, member, ws, {
      type: "updateProject",
      id: project.id,
      patch: { name: "Website", status: "in_progress" },
      unset: ["targetDate", "leadId"],
    });
    const p = (await view(t, owner, ws)).state.projects[0];
    expect(p).toMatchObject({ name: "Website", status: "in_progress" });
    expect(p).not.toHaveProperty("targetDate");
    expect(p).not.toHaveProperty("leadId");
  });

  it("updatePost sets fields and clears clearable ones", async () => {
    const { t, owner, member, ws } = await team();
    const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Web", key: "WEB" } })) as Project;
    const post = (await apply(t, owner, ws, {
      type: "createPost",
      data: { title: "Hook", platform: "tiktok", projectId: project.id, scheduledAt: "2026-12-01T10:00:00.000Z" },
    })) as Post;
    await apply(t, member, ws, {
      type: "updatePost",
      id: post.id,
      patch: { title: "Better hook", status: "scheduled" },
      unset: ["projectId", "scheduledAt"],
    });
    const p = (await view(t, owner, ws)).state.posts[0];
    expect(p).toMatchObject({ title: "Better hook", status: "scheduled" });
    expect(p).not.toHaveProperty("projectId");
    expect(p).not.toHaveProperty("scheduledAt");
  });

  it("addSnapshot then removeSnapshot", async () => {
    const { t, owner, ws } = await team();
    const post = (await apply(t, owner, ws, { type: "createPost", data: { title: "Hook", platform: "tiktok" } })) as Post;
    const snap = (await apply(t, owner, ws, {
      type: "addSnapshot",
      postId: post.id,
      snapshot: { atMinutes: 60, impressions: 1000, views: 800, likes: 50, comments: 5, shares: 3, saves: 2 },
    })) as EngagementSnapshot;
    expect((await view(t, owner, ws)).state.posts[0].snapshots.map((s) => s.id)).toEqual([snap.id]);
    await apply(t, owner, ws, { type: "removeSnapshot", postId: post.id, snapshotId: snap.id });
    expect((await view(t, owner, ws)).state.posts[0].snapshots).toEqual([]);
  });

  it("addComment is attributed to the caller", async () => {
    const { t, owner, member, ws } = await team();
    const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Web", key: "WEB" } })) as Project;
    const task = (await apply(t, owner, ws, { type: "createTask", data: { projectId: project.id, title: "x" } })) as Task;
    await apply(t, member, ws, { type: "addComment", taskId: task.id, body: "  looks good  " });
    const stored = (await view(t, owner, ws)).state.tasks[0];
    expect(stored.comments).toHaveLength(1);
    expect(stored.comments[0]).toMatchObject({ authorId: member.userId, body: "looks good" });
    expect(stored.activity.at(-1)).toMatchObject({ authorId: member.userId, message: "Commented" });
  });

  it("labels are listed in the order they were added", async () => {
    const { t, owner, ws } = await team();
    for (const name of ["first", "second", "third"]) {
      await apply(t, owner, ws, { type: "addLabel", data: { name, color: "#000000" } });
    }
    expect((await view(t, owner, ws)).state.labels.map((l: Label) => l.name)).toEqual(["first", "second", "third"]);
  });
});

describe("owner-only management", () => {
  it("members cannot rename or delete the workspace, or remove labels", async () => {
    const { t, owner, member, ws } = await team();
    const label = (await apply(t, owner, ws, { type: "addLabel", data: { name: "bug", color: "#dc2626" } })) as Label;
    expect(await errorCode(as(t, member).mutation(api.workspace.rename, { workspaceId: ws, name: "Mine now" }))).toBe("Forbidden");
    expect(await errorCode(as(t, member).mutation(api.workspace.deleteWorkspace, { workspaceId: ws }))).toBe("Forbidden");
    expect(await errorCode(apply(t, member, ws, { type: "removeLabel", id: label.id }))).toBe("Forbidden");
    await as(t, owner).mutation(api.workspace.rename, { workspaceId: ws, name: "  Renamed  " });
    expect((await view(t, member, ws)).name).toBe("Renamed");
  });
});

describe("field-granular updates on the server", () => {
  it("two members editing different parts of one post both keep their change", async () => {
    const { t, owner, member, ws } = await team();
    const post = (await apply(t, owner, ws, { type: "createPost", data: { title: "Hook", platform: "tiktok" } })) as Post;
    await apply(t, owner, ws, { type: "updatePost", id: post.id, patch: {}, contentPatch: { hook: "owner's hook" } });
    await apply(t, member, ws, { type: "updatePost", id: post.id, patch: {}, contentPatch: { caption: "member's caption" } });
    await apply(t, member, ws, { type: "updatePost", id: post.id, patch: {}, contextPatch: { novelty: 5 } });
    const p = (await view(t, owner, ws)).state.posts[0];
    expect(p.content.hook).toBe("owner's hook");
    expect(p.content.caption).toBe("member's caption");
    expect(p.context.novelty).toBe(5);
  });

  it("label additions from two members merge", async () => {
    const { t, owner, member, ws } = await team();
    const project = (await apply(t, owner, ws, { type: "createProject", data: { name: "Web", key: "WEB" } })) as Project;
    const task = (await apply(t, owner, ws, { type: "createTask", data: { projectId: project.id, title: "x" } })) as Task;
    await apply(t, owner, ws, { type: "updateTask", id: task.id, patch: {}, labelIdsAdd: ["l_a"] });
    await apply(t, member, ws, { type: "updateTask", id: task.id, patch: {}, labelIdsAdd: ["l_b"] });
    expect((await view(t, owner, ws)).state.tasks[0].labelIds).toEqual(["l_a", "l_b"]);
  });
});
