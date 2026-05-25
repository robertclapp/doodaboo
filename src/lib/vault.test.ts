import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initVault,
  loadWorkspace,
  migrate,
  saveWorkspace,
  vaultExists,
  vaultPaths,
  withWorkspace,
  VaultCorruptError,
  VaultNotFoundError,
} from "./vault";
import { createTask, emptyWorkspace, WORKSPACE_VERSION } from "./mutations";

async function tmpVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "doodaboo-test-"));
  return root;
}

describe("vault", () => {
  it("init creates workspace.json + scaffolding", async () => {
    const root = await tmpVault();
    await initVault(root, { force: true });
    assert.equal(await vaultExists(root), true);
    const paths = vaultPaths(root);
    const stat = await fs.stat(paths.workspaceFile);
    assert.ok(stat.isFile());
    for (const dir of [paths.backupsDir, paths.pluginsDir, paths.exportsDir]) {
      assert.ok((await fs.stat(dir)).isDirectory());
    }
  });

  it("load → save → load round-trips state", async () => {
    const root = await tmpVault();
    await initVault(root, { force: true });
    const a = await loadWorkspace(root);
    assert.equal(a.version, WORKSPACE_VERSION);

    const r = createTask(a, {
      projectId: a.projects[0].id,
      title: "vault-test-task",
    });
    await saveWorkspace(r.state, root);

    const b = await loadWorkspace(root);
    assert.ok(b.tasks.some((t) => t.title === "vault-test-task"));
  });

  it("rolls a backup file on every save", async () => {
    const root = await tmpVault();
    await initVault(root, { force: true });
    const paths = vaultPaths(root);
    const before = (await fs.readdir(paths.backupsDir)).filter((f) =>
      f.endsWith(".json"),
    ).length;
    await saveWorkspace(emptyWorkspace(), root);
    const after = (await fs.readdir(paths.backupsDir)).filter((f) =>
      f.endsWith(".json"),
    ).length;
    assert.ok(after > before);
  });

  it("throws VaultNotFoundError for an empty directory", async () => {
    const root = await tmpVault();
    await assert.rejects(loadWorkspace(root), VaultNotFoundError);
  });

  it("throws VaultCorruptError on garbage workspace.json", async () => {
    const root = await tmpVault();
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(
      path.join(root, "workspace.json"),
      "not json at all",
      "utf-8",
    );
    await assert.rejects(loadWorkspace(root), VaultCorruptError);
  });

  it("withWorkspace runs a load-mutate-save cycle atomically", async () => {
    const root = await tmpVault();
    await initVault(root, { force: true });
    const taskId = await withWorkspace((s) => {
      const r = createTask(s, {
        projectId: s.projects[0].id,
        title: "atomic",
      });
      return { state: r.state, result: r.task.id };
    }, root);
    const reloaded = await loadWorkspace(root);
    assert.ok(reloaded.tasks.some((t) => t.id === taskId));
  });

  it("withWorkspace serialises concurrent mutators", async () => {
    const root = await tmpVault();
    await initVault(root, { force: true });
    const projectId = (await loadWorkspace(root)).projects[0].id;

    // Fire 5 concurrent task creations. Without the lock, two parallel
    // loads would see the same nextTaskNumber and the second save would
    // overwrite the first.
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        withWorkspace((s) => {
          const r = createTask(s, { projectId, title: `parallel ${i}` });
          return { state: r.state, result: r.task.id };
        }, root),
      ),
    );

    const final = await loadWorkspace(root);
    const numbers = final.tasks
      .filter((t) => t.projectId === projectId && /^parallel /.test(t.title))
      .map((t) => t.number);
    assert.equal(numbers.length, 5);
    assert.equal(new Set(numbers).size, 5, "task numbers must be unique");
  });
});

describe("migrate (trust boundary)", () => {
  it("throws VaultCorruptError when input is not an object", () => {
    assert.throws(() => migrate("not an object"), VaultCorruptError);
    assert.throws(() => migrate(null), VaultCorruptError);
    assert.throws(() => migrate(42 as unknown), VaultCorruptError);
  });

  it("rejects a future-version payload", () => {
    assert.throws(
      () => migrate({ version: WORKSPACE_VERSION + 1 }),
      /newer than this build supports/,
    );
  });

  it("backfills missing top-level arrays", () => {
    const s = migrate({ version: 1 });
    assert.deepEqual(s.users, []);
    assert.deepEqual(s.labels, []);
    assert.deepEqual(s.projects, []);
    assert.deepEqual(s.tasks, []);
    assert.deepEqual(s.posts, []);
  });

  it("backfills missing nested arrays on tasks", () => {
    const s = migrate({
      version: 1,
      tasks: [{ id: "t_x", projectId: "p_x", number: 1, title: "t" }],
    });
    assert.deepEqual(s.tasks[0].labelIds, []);
    assert.deepEqual(s.tasks[0].comments, []);
    assert.deepEqual(s.tasks[0].activity, []);
  });

  it("recomputes nextTaskNumber from existing task numbers when missing", () => {
    const s = migrate({
      version: 1,
      projects: [{ id: "p_x", key: "X", name: "X" }],
      tasks: [
        { id: "t1", projectId: "p_x", number: 5, title: "x" },
        { id: "t2", projectId: "p_x", number: 3, title: "y" },
      ],
    });
    assert.equal(s.projects[0].nextTaskNumber, 6);
  });

  it("backfills missing post content + hashtags", () => {
    const s = migrate({
      version: 1,
      posts: [{ id: "po_x", title: "t", platform: "tiktok" }],
    });
    assert.equal(s.posts[0].content.hook, "");
    assert.deepEqual(s.posts[0].content.hashtags, []);
    assert.deepEqual(s.posts[0].snapshots, []);
  });

  it("coerces NaN/Infinity/negative snapshot fields to 0", () => {
    const s = migrate({
      version: 1,
      posts: [
        {
          id: "po_x",
          title: "t",
          platform: "tiktok",
          content: { hook: "", caption: "", hashtags: [], transcript: "", format: "video", hasTrendingAudio: false },
          context: {},
          threshold: { metric: "views", value: 1, window: "7d" },
          snapshots: [
            {
              id: "s1",
              atMinutes: -5,
              impressions: NaN,
              views: Infinity,
              likes: -3,
              comments: 0,
              shares: 0,
              saves: 0,
              capturedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    });
    const snap = s.posts[0].snapshots[0];
    assert.equal(snap.atMinutes, 0);
    assert.equal(snap.impressions, 0);
    assert.equal(snap.views, 0);
    assert.equal(snap.likes, 0);
  });

  it("drops out-of-range retentionPct / negative watchTimeAvgSec", () => {
    const s = migrate({
      version: 1,
      posts: [
        {
          id: "po_x",
          title: "t",
          platform: "tiktok",
          content: { hook: "", caption: "", hashtags: [], transcript: "", format: "video", hasTrendingAudio: false },
          context: {},
          threshold: { metric: "views", value: 1, window: "7d" },
          snapshots: [
            {
              id: "s1",
              atMinutes: 5,
              impressions: 100,
              views: 90,
              likes: 0,
              comments: 0,
              shares: 0,
              saves: 0,
              retentionPct: 150,
              watchTimeAvgSec: -1,
              capturedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    });
    const snap = s.posts[0].snapshots[0];
    assert.equal(snap.retentionPct, undefined);
    assert.equal(snap.watchTimeAvgSec, undefined);
  });

  it("defaults theme to 'system' and falls back currentUserId to first user", () => {
    const s = migrate({
      version: 1,
      users: [{ id: "u_only", name: "only", handle: "only", color: "#000" }],
    });
    assert.equal(s.theme, "system");
    assert.equal(s.currentUserId, "u_only");
  });

  it("bumps version to current WORKSPACE_VERSION", () => {
    const s = migrate({ version: 0 });
    assert.equal(s.version, WORKSPACE_VERSION);
  });

  it("backfills project.memberIds when missing", () => {
    const s = migrate({
      version: 1,
      projects: [{ id: "p_x", key: "X", name: "X", nextTaskNumber: 1 }],
    });
    assert.deepEqual(s.projects[0].memberIds, []);
  });

  it("backfills post.content.hashtags when hashtags is not an array", () => {
    const s = migrate({
      version: 1,
      posts: [
        {
          id: "po_x",
          title: "t",
          platform: "tiktok",
          content: {
            hook: "h",
            caption: "c",
            hashtags: "not-an-array",
            transcript: "",
            format: "video",
            hasTrendingAudio: false,
          },
        },
      ],
    });
    assert.deepEqual(s.posts[0].content.hashtags, []);
  });

  it("currentUserId falls back to 'u_unknown' when users array is empty", () => {
    const s = migrate({ version: 1, users: [] });
    assert.equal(s.currentUserId, "u_unknown");
  });

  it("preserves currentUserId when it is already a non-empty string", () => {
    const s = migrate({
      version: 1,
      users: [{ id: "u_mine", name: "X", handle: "x", color: "#000" }],
      currentUserId: "u_explicit",
    });
    assert.equal(s.currentUserId, "u_explicit");
  });

  it("recomputes nextTaskNumber to 1 when project has no tasks", () => {
    const s = migrate({
      version: 1,
      projects: [{ id: "p_empty", key: "E", name: "Empty" }],
      tasks: [],
    });
    assert.equal(s.projects[0].nextTaskNumber, 1);
  });

  it("coerces non-numeric retentionPct (string) to undefined", () => {
    const s = migrate({
      version: 1,
      posts: [
        {
          id: "po_x",
          title: "t",
          platform: "tiktok",
          content: { hook: "", caption: "", hashtags: [], transcript: "", format: "video", hasTrendingAudio: false },
          context: {},
          threshold: { metric: "views", value: 1, window: "7d" },
          snapshots: [
            {
              id: "s1",
              atMinutes: 5,
              impressions: 100,
              views: 90,
              likes: 0,
              comments: 0,
              shares: 0,
              saves: 0,
              retentionPct: "50%",
              capturedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    });
    const snap = s.posts[0].snapshots[0];
    assert.equal(snap.retentionPct, undefined);
  });
});

describe("vaultPaths", () => {
  it("derives all subdirectory paths from root", () => {
    const paths = vaultPaths("/tmp/myvault");
    assert.equal(paths.root, "/tmp/myvault");
    assert.ok(paths.workspaceFile.endsWith("workspace.json"));
    assert.ok(paths.backupsDir.includes("backups"));
    assert.ok(paths.pluginsDir.includes("plugins"));
    assert.ok(paths.exportsDir.includes("exports"));
  });
});

describe("VaultNotFoundError / VaultCorruptError shapes", () => {
  it("VaultNotFoundError carries the path and name", () => {
    const err = new VaultNotFoundError("/tmp/missing");
    assert.equal(err.name, "VaultNotFoundError");
    assert.equal(err.path, "/tmp/missing");
    assert.ok(err instanceof Error);
  });

  it("VaultCorruptError has name 'VaultCorruptError'", () => {
    const err = new VaultCorruptError("bad json");
    assert.equal(err.name, "VaultCorruptError");
    assert.ok(err instanceof Error);
    assert.equal(err.message, "bad json");
  });
});

describe("vault — backup trimming", () => {
  it("does not exceed MAX_BACKUPS (20) after many saves", async () => {
    const root = await tmpVault();
    await initVault(root, { force: true });
    const paths = vaultPaths(root);
    const ws = emptyWorkspace();
    // Save 25 times — should retain at most 20 backup files.
    for (let i = 0; i < 25; i++) {
      await saveWorkspace(ws, root);
    }
    const backups = (await fs.readdir(paths.backupsDir)).filter(
      (n) => n.startsWith("workspace-") && n.endsWith(".json"),
    );
    assert.ok(backups.length <= 20, `expected ≤20 backups, got ${backups.length}`);
  });
});

describe("vaultExists", () => {
  it("returns false when the directory does not contain workspace.json", async () => {
    const root = await tmpVault();
    // tmpVault creates an empty dir — no workspace.json yet
    assert.equal(await vaultExists(root), false);
  });

  it("returns true after initVault", async () => {
    const root = await tmpVault();
    await initVault(root, { force: true });
    assert.equal(await vaultExists(root), true);
  });
});
