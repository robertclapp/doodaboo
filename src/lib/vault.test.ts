import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  defaultVaultRoot,
  initVault,
  loadWorkspace,
  migrate,
  saveWorkspace,
  vaultExists,
  vaultPaths,
  watchWorkspace,
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

  it("backfills post.content.hashtags when not an array", () => {
    const s = migrate({
      version: 1,
      posts: [
        {
          id: "po_x",
          title: "t",
          platform: "tiktok",
          content: {
            hook: "",
            caption: "",
            hashtags: "not-an-array",
            transcript: "",
            format: "video",
            hasTrendingAudio: false,
          },
          context: {},
          threshold: { metric: "views", value: 1, window: "7d" },
          snapshots: [],
        },
      ],
    });
    assert.deepEqual(s.posts[0].content.hashtags, []);
  });

  it("recomputes nextTaskNumber=1 when project has no tasks", () => {
    const s = migrate({
      version: 1,
      projects: [{ id: "p_empty", key: "E", name: "E" }],
      tasks: [],
    });
    assert.equal(s.projects[0].nextTaskNumber, 1);
  });

  it("preserves currentUserId when it is a non-empty known string", () => {
    const s = migrate({
      version: 1,
      currentUserId: "u_known",
      users: [{ id: "u_known", name: "K", handle: "k", color: "#000" }],
    });
    assert.equal(s.currentUserId, "u_known");
  });

  it("falls back currentUserId to 'u_unknown' when users array is empty", () => {
    const s = migrate({ version: 1, users: [] });
    assert.equal(s.currentUserId, "u_unknown");
  });

  it("coerces non-numeric retentionPct (string) to undefined", () => {
    const s = migrate({
      version: 1,
      posts: [
        {
          id: "po_x",
          title: "t",
          platform: "tiktok",
          content: {
            hook: "",
            caption: "",
            hashtags: [],
            transcript: "",
            format: "video",
            hasTrendingAudio: false,
          },
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
              retentionPct: "fifty",
              capturedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    });
    assert.equal(s.posts[0].snapshots[0].retentionPct, undefined);
  });

  it("backfills post.snapshots when missing entirely", () => {
    const s = migrate({
      version: 1,
      posts: [{ id: "po_x", title: "t", platform: "tiktok" }],
    });
    assert.deepEqual(s.posts[0].snapshots, []);
  });

  it("backfills theme to 'system' when it's not a string", () => {
    const s = migrate({ version: 1, theme: 42 });
    assert.equal(s.theme, "system");
  });

  it("preserves an explicit theme value", () => {
    const s = migrate({ version: 1, theme: "dark" });
    assert.equal(s.theme, "dark");
  });

  it("treats a missing version as 0 and bumps it to WORKSPACE_VERSION", () => {
    const s = migrate({});
    assert.equal(s.version, WORKSPACE_VERSION);
  });
});

describe("VaultNotFoundError / VaultCorruptError shape", () => {
  it("VaultNotFoundError carries the path and name", () => {
    const e = new VaultNotFoundError("/tmp/x");
    assert.equal(e.name, "VaultNotFoundError");
    assert.equal(e.path, "/tmp/x");
  });

  it("VaultCorruptError has the expected name", () => {
    const e = new VaultCorruptError("bad");
    assert.equal(e.name, "VaultCorruptError");
  });
});

describe("defaultVaultRoot", () => {
  it("uses DOODABOO_VAULT env var when set", () => {
    const prev = process.env.DOODABOO_VAULT;
    process.env.DOODABOO_VAULT = "/tmp/env-vault";
    try {
      assert.equal(defaultVaultRoot(), "/tmp/env-vault");
    } finally {
      if (prev === undefined) delete process.env.DOODABOO_VAULT;
      else process.env.DOODABOO_VAULT = prev;
    }
  });

  it("falls back to ~/.doodaboo when DOODABOO_VAULT is unset", () => {
    const prev = process.env.DOODABOO_VAULT;
    delete process.env.DOODABOO_VAULT;
    try {
      const root = defaultVaultRoot();
      assert.ok(root.endsWith(".doodaboo"), `got ${root}`);
    } finally {
      if (prev !== undefined) process.env.DOODABOO_VAULT = prev;
    }
  });
});

describe("withWorkspace error handling", () => {
  it("propagates errors thrown by the mutator", async () => {
    const root = await tmpVault();
    await initVault(root, { force: true });
    await assert.rejects(
      withWorkspace(() => {
        throw new Error("boom from mutator");
      }, root),
      /boom from mutator/,
    );
  });
});

describe("saveWorkspace — backup pruning", () => {
  it("prunes backups beyond MAX_BACKUPS=20", async () => {
    const root = await tmpVault();
    await initVault(root, { force: true });
    const paths = vaultPaths(root);
    const ws = await loadWorkspace(root);

    // Create 25 saves to exceed the 20-backup ceiling. The save dance
    // names backups by ISO timestamp, so we need them to differ.
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 2));
      await saveWorkspace(ws, root);
    }

    const backups = (await fs.readdir(paths.backupsDir)).filter(
      (n) => n.startsWith("workspace-") && n.endsWith(".json"),
    );
    assert.ok(
      backups.length <= 20,
      `expected ≤20 backups, found ${backups.length}`,
    );
  });
});

describe("watchWorkspace", () => {
  it("returns a cleanup function that doesn't throw when invoked", async () => {
    const root = await tmpVault();
    await initVault(root, { force: true });
    const stop = watchWorkspace(() => {}, root);
    assert.equal(typeof stop, "function");
    assert.doesNotThrow(() => stop());
  });
});
