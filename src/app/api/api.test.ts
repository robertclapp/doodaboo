/**
 * Integration tests for the Next.js API route handlers.
 *
 * Routes are imported and invoked as plain async functions. Each test
 * points DOODABOO_VAULT at a fresh temp directory and initialises a
 * vault, so the handlers operate against isolated state.
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { initVault } from "@/lib/vault";

// Use cwd-relative imports through @/ alias so tsx + tsconfig paths apply.
import * as healthRoute from "./health/route";
import * as workspaceRoute from "./workspace/route";
import * as postsRoute from "./posts/route";
import * as postIdRoute from "./posts/[postId]/route";
import * as postSnapshotsRoute from "./posts/[postId]/snapshots/route";
import * as postScoreRoute from "./posts/[postId]/score/route";
import * as projectsRoute from "./projects/route";
import * as tasksRoute from "./tasks/route";
import * as taskIdRoute from "./tasks/[taskId]/route";
import * as hooksRoute from "./hooks/route";
import * as playbooksRoute from "./playbooks/route";
import * as playbookIdRoute from "./playbooks/[playbookId]/route";

async function makeVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "doodaboo-api-"));
  await initVault(root, { force: true });
  return root;
}

function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

let prevVault: string | undefined;
let vaultRoot: string;

beforeEach(async () => {
  vaultRoot = await makeVault();
  prevVault = process.env.DOODABOO_VAULT;
  process.env.DOODABOO_VAULT = vaultRoot;
});

afterEach(async () => {
  if (prevVault === undefined) delete process.env.DOODABOO_VAULT;
  else process.env.DOODABOO_VAULT = prevVault;
  await fs.rm(vaultRoot, { recursive: true, force: true });
});

// ── /api/health ────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns ok=true with vault metadata for an initialised vault", async () => {
    const res = await healthRoute.GET();
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.ok, true);
    assert.ok(body.vault);
  });
});

// ── /api/workspace ─────────────────────────────────────────────────────────

describe("GET /api/workspace", () => {
  it("returns the loaded workspace", async () => {
    const res = await workspaceRoute.GET();
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.version, 1);
    assert.ok(Array.isArray(body.users));
  });
});

describe("PUT /api/workspace", () => {
  it("accepts a valid payload and saves it through migrate()", async () => {
    const start = await (await workspaceRoute.GET()).json();
    const req = new Request("http://t/api/workspace", {
      method: "PUT",
      body: JSON.stringify(start),
      headers: { "content-type": "application/json" },
    });
    const res = await workspaceRoute.PUT(req);
    assert.equal(res.status, 200);
  });

  it("rejects a future-version payload (migrate trust boundary)", async () => {
    const req = new Request("http://t/api/workspace", {
      method: "PUT",
      body: JSON.stringify({ version: 999, users: [] }),
      headers: { "content-type": "application/json" },
    });
    const res = await workspaceRoute.PUT(req);
    assert.equal(res.status, 500);
    const body = (await res.json()) as any;
    assert.match(body.error, /newer than this build/);
  });

  it("backfills missing arrays without crashing (migrate)", async () => {
    const req = new Request("http://t/api/workspace", {
      method: "PUT",
      body: JSON.stringify({ version: 1 }),
      headers: { "content-type": "application/json" },
    });
    const res = await workspaceRoute.PUT(req);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.deepEqual(body.users, []);
    assert.deepEqual(body.tasks, []);
  });

  it("400s on non-JSON body", async () => {
    const req = new Request("http://t/api/workspace", {
      method: "PUT",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await workspaceRoute.PUT(req);
    assert.equal(res.status, 400);
  });
});

// ── /api/posts ─────────────────────────────────────────────────────────────

describe("/api/posts", () => {
  it("GET returns all seeded posts", async () => {
    const res = await postsRoute.GET(new Request("http://t/api/posts"));
    const body = (await res.json()) as any[];
    assert.ok(body.length > 0);
  });

  it("GET filters by platform", async () => {
    const res = await postsRoute.GET(
      new Request("http://t/api/posts?platform=tiktok"),
    );
    const body = (await res.json()) as any[];
    for (const p of body) assert.equal(p.platform, "tiktok");
  });

  it("GET filters by status", async () => {
    const res = await postsRoute.GET(
      new Request("http://t/api/posts?status=draft"),
    );
    const body = (await res.json()) as any[];
    for (const p of body) assert.equal(p.status, "draft");
  });

  it("GET ?score=1 enriches each post with intrinsic+live", async () => {
    const res = await postsRoute.GET(
      new Request("http://t/api/posts?score=1"),
    );
    const body = (await res.json()) as any[];
    for (const p of body) {
      assert.ok(p.intrinsic);
      assert.equal(typeof p.intrinsic.value, "number");
    }
  });

  it("POST creates a new post and returns 201", async () => {
    const req = new Request("http://t/api/posts", {
      method: "POST",
      body: JSON.stringify({ title: "new", platform: "tiktok" }),
    });
    const res = await postsRoute.POST(req);
    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.title, "new");
    assert.match(body.id, /^po_/);
  });

  it("POST 400s on missing title", async () => {
    const req = new Request("http://t/api/posts", {
      method: "POST",
      body: JSON.stringify({ platform: "tiktok" }),
    });
    const res = await postsRoute.POST(req);
    assert.equal(res.status, 400);
  });

  it("POST 400s on missing platform", async () => {
    const req = new Request("http://t/api/posts", {
      method: "POST",
      body: JSON.stringify({ title: "x" }),
    });
    const res = await postsRoute.POST(req);
    assert.equal(res.status, 400);
  });
});

// ── /api/posts/[id] ────────────────────────────────────────────────────────

describe("/api/posts/[id]", () => {
  async function firstPostId(): Promise<string> {
    const res = await postsRoute.GET(new Request("http://t/api/posts"));
    const body = (await res.json()) as any[];
    return body[0].id;
  }

  it("GET returns the post", async () => {
    const id = await firstPostId();
    const res = await postIdRoute.GET(new Request("http://t/"), ctx({ postId: id }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.id, id);
  });

  it("GET 404s on unknown id", async () => {
    const res = await postIdRoute.GET(
      new Request("http://t/"),
      ctx({ postId: "po_nope" }),
    );
    assert.equal(res.status, 404);
  });

  it("PATCH merges patch fields and returns updated post", async () => {
    const id = await firstPostId();
    const req = new Request("http://t/", {
      method: "PATCH",
      body: JSON.stringify({ title: "renamed" }),
    });
    const res = await postIdRoute.PATCH(req, ctx({ postId: id }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.title, "renamed");
  });

  it("PATCH 404s on unknown id", async () => {
    const req = new Request("http://t/", {
      method: "PATCH",
      body: JSON.stringify({ title: "x" }),
    });
    const res = await postIdRoute.PATCH(req, ctx({ postId: "po_nope" }));
    assert.equal(res.status, 404);
  });

  it("POST duplicates and returns 201", async () => {
    const id = await firstPostId();
    const res = await postIdRoute.POST(
      new Request("http://t/", { method: "POST" }),
      ctx({ postId: id }),
    );
    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.notEqual(body.id, id);
    assert.match(body.title, /\(variant\)/);
  });

  it("POST 404s on unknown id", async () => {
    const res = await postIdRoute.POST(
      new Request("http://t/", { method: "POST" }),
      ctx({ postId: "po_nope" }),
    );
    assert.equal(res.status, 404);
  });

  it("DELETE removes the post and returns 204", async () => {
    const id = await firstPostId();
    const res = await postIdRoute.DELETE(
      new Request("http://t/", { method: "DELETE" }),
      ctx({ postId: id }),
    );
    assert.equal(res.status, 204);
  });

  it("DELETE 404s on unknown id", async () => {
    const res = await postIdRoute.DELETE(
      new Request("http://t/", { method: "DELETE" }),
      ctx({ postId: "po_nope" }),
    );
    assert.equal(res.status, 404);
  });
});

// ── /api/posts/[id]/snapshots ──────────────────────────────────────────────

describe("/api/posts/[id]/snapshots", () => {
  async function firstPostId(): Promise<string> {
    const res = await postsRoute.GET(new Request("http://t/api/posts"));
    return ((await res.json()) as any[])[0].id;
  }

  it("GET returns the post's snapshots", async () => {
    const id = await firstPostId();
    const res = await postSnapshotsRoute.GET(
      new Request("http://t/"),
      ctx({ postId: id }),
    );
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(await res.json()));
  });

  it("GET 404s on unknown post", async () => {
    const res = await postSnapshotsRoute.GET(
      new Request("http://t/"),
      ctx({ postId: "po_nope" }),
    );
    assert.equal(res.status, 404);
  });

  it("POST 400s when atMinutes is missing", async () => {
    const id = await firstPostId();
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({
        impressions: 0,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
      }),
    });
    const res = await postSnapshotsRoute.POST(req, ctx({ postId: id }));
    assert.equal(res.status, 400);
  });

  it("POST adds a snapshot and returns 201", async () => {
    const id = await firstPostId();
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({
        atMinutes: 10,
        impressions: 100,
        views: 90,
        likes: 5,
        comments: 0,
        shares: 0,
        saves: 0,
      }),
    });
    const res = await postSnapshotsRoute.POST(req, ctx({ postId: id }));
    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.atMinutes, 10);
  });

  it("POST 500s with a useful error for invalid (negative) values", async () => {
    // addSnapshot throws; handle() wraps as 500.
    const origError = console.error;
    console.error = () => {};
    try {
      const id = await firstPostId();
      const req = new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({
          atMinutes: 10,
          impressions: -5,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
        }),
      });
      const res = await postSnapshotsRoute.POST(req, ctx({ postId: id }));
      assert.equal(res.status, 500);
      const body = (await res.json()) as any;
      assert.match(body.error, /non-negative/);
    } finally {
      console.error = origError;
    }
  });
});

// ── /api/posts/[id]/score ──────────────────────────────────────────────────

describe("/api/posts/[id]/score", () => {
  it("returns intrinsic, live, projection, recommendations", async () => {
    const list = await postsRoute.GET(new Request("http://t/api/posts"));
    const id = ((await list.json()) as any[])[0].id;
    const res = await postScoreRoute.GET(
      new Request("http://t/"),
      ctx({ postId: id }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.intrinsic);
    assert.equal(typeof body.intrinsic.value, "number");
    assert.ok(Array.isArray(body.recommendations));
  });

  it("404s on unknown post", async () => {
    const res = await postScoreRoute.GET(
      new Request("http://t/"),
      ctx({ postId: "po_nope" }),
    );
    assert.equal(res.status, 404);
  });

  it("isolates a throwing plugin (does NOT 500 the scoring endpoint)", async () => {
    // Install a plugin that throws inside scoreFactors. The route's
    // try/catch (route.ts:32-46) must keep the endpoint healthy.
    const pluginsDir = path.join(vaultRoot, "plugins", "broken");
    await fs.mkdir(pluginsDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginsDir, "plugin.json"),
      JSON.stringify({ id: "broken", name: "Broken", version: "1.0.0" }),
      "utf-8",
    );
    await fs.writeFile(
      path.join(pluginsDir, "index.js"),
      `export default { manifest: { id: 'broken', name: 'Broken', version: '1.0.0' }, scoreFactors: () => { throw new Error('boom'); } };`,
      "utf-8",
    );

    // Suppress the expected warning log.
    const origWarn = console.warn;
    const origLog = console.log;
    console.warn = () => {};
    console.log = () => {};
    try {
      const list = await postsRoute.GET(new Request("http://t/api/posts"));
      const id = ((await list.json()) as any[])[0].id;
      const res = await postScoreRoute.GET(
        new Request("http://t/"),
        ctx({ postId: id }),
      );
      assert.equal(res.status, 200, "scoring must survive broken plugin");
      const body = (await res.json()) as any;
      assert.ok(body.intrinsic);
    } finally {
      console.warn = origWarn;
      console.log = origLog;
    }
  });
});

// ── /api/projects ──────────────────────────────────────────────────────────

describe("/api/projects", () => {
  it("GET returns seeded projects", async () => {
    const res = await projectsRoute.GET();
    const body = (await res.json()) as any[];
    assert.ok(body.length > 0);
  });

  it("POST creates a project (201)", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ name: "New", key: "NEW" }),
    });
    const res = await projectsRoute.POST(req);
    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.name, "New");
  });

  it("POST 400s on missing name/key", async () => {
    const a = await projectsRoute.POST(
      new Request("http://t/", { method: "POST", body: JSON.stringify({}) }),
    );
    assert.equal(a.status, 400);
    const aBody = (await a.json()) as any;
    assert.match(aBody.error, /name and key/);
  });
});

// ── /api/tasks/[id] ────────────────────────────────────────────────────────

describe("/api/tasks/[id]", () => {
  async function firstTaskId(): Promise<string> {
    const res = await tasksRoute.GET(new Request("http://t/api/tasks"));
    return ((await res.json()) as any[])[0].id;
  }

  it("PATCH honors x-actor-id header for activity attribution", async () => {
    const id = await firstTaskId();
    const req = new Request("http://t/", {
      method: "PATCH",
      body: JSON.stringify({ status: "done" }),
      headers: { "x-actor-id": "u_api_actor" },
    });
    const res = await taskIdRoute.PATCH(req, ctx({ taskId: id }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    const lastActivity = body.activity[body.activity.length - 1];
    assert.equal(lastActivity.authorId, "u_api_actor");
  });

  it("PATCH applies an inline comment when present", async () => {
    const id = await firstTaskId();
    const req = new Request("http://t/", {
      method: "PATCH",
      body: JSON.stringify({ comment: "hello from api" }),
    });
    const res = await taskIdRoute.PATCH(req, ctx({ taskId: id }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.comments.find((c: any) => c.body === "hello from api"));
  });

  it("PATCH 404s for unknown task", async () => {
    const req = new Request("http://t/", {
      method: "PATCH",
      body: JSON.stringify({ status: "done" }),
    });
    const res = await taskIdRoute.PATCH(req, ctx({ taskId: "t_nope" }));
    assert.equal(res.status, 404);
  });

  it("DELETE 204s on success, 404 on missing", async () => {
    const id = await firstTaskId();
    const ok = await taskIdRoute.DELETE(new Request("http://t/"), ctx({ taskId: id }));
    assert.equal(ok.status, 204);
    const miss = await taskIdRoute.DELETE(
      new Request("http://t/"),
      ctx({ taskId: id }),
    );
    assert.equal(miss.status, 404);
  });
});

// ── /api/hooks ─────────────────────────────────────────────────────────────

describe("POST /api/hooks", () => {
  it("400s when subject is missing", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await hooksRoute.POST(req);
    assert.equal(res.status, 400);
  });

  it("returns variants filtered for the requested platform", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ subject: "ai", platform: "tiktok" }),
    });
    const res = await hooksRoute.POST(req);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any[];
    assert.ok(body.length > 0);
    for (const v of body) assert.ok(v.fits.includes("tiktok"));
  });

  it("defaults platform to 'all' (returns every variant)", async () => {
    const a = await hooksRoute.POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ subject: "ai" }),
      }),
    );
    const b = await hooksRoute.POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ subject: "ai", platform: "all" }),
      }),
    );
    assert.equal(
      ((await a.json()) as any[]).length,
      ((await b.json()) as any[]).length,
    );
  });
});

// ── /api/playbooks ─────────────────────────────────────────────────────────

describe("/api/playbooks", () => {
  it("GET returns the static catalogue", async () => {
    const res = await playbooksRoute.GET();
    const body = (await res.json()) as any[];
    assert.ok(body.length > 0);
  });

  it("GET /:id returns a playbook, 404 on unknown", async () => {
    const ok = await playbookIdRoute.GET(
      new Request("http://t/"),
      ctx({ playbookId: "pb_3s_hook" }),
    );
    assert.equal(ok.status, 200);
    const miss = await playbookIdRoute.GET(
      new Request("http://t/"),
      ctx({ playbookId: "pb_does_not_exist" }),
    );
    assert.equal(miss.status, 404);
  });

  it("POST /:id applies a playbook to a post", async () => {
    const list = await postsRoute.GET(new Request("http://t/api/posts"));
    const id = ((await list.json()) as any[])[0].id;
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ postId: id }),
    });
    const res = await playbookIdRoute.POST(req, ctx({ playbookId: "pb_3s_hook" }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.postId, id);
    assert.equal(body.playbookId, "pb_3s_hook");
    assert.ok(Array.isArray(body.changes));
  });

  it("POST /:id 400s on missing postId", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await playbookIdRoute.POST(req, ctx({ playbookId: "pb_3s_hook" }));
    assert.equal(res.status, 400);
  });

  it("POST /:id 404s for unknown playbook", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ postId: "anything" }),
    });
    const res = await playbookIdRoute.POST(req, ctx({ playbookId: "pb_nope" }));
    assert.equal(res.status, 404);
  });

  it("POST /:id 404s for unknown post", async () => {
    const req = new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ postId: "po_nope" }),
    });
    const res = await playbookIdRoute.POST(req, ctx({ playbookId: "pb_3s_hook" }));
    assert.equal(res.status, 404);
  });
});
