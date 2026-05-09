import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initVault,
  loadWorkspace,
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
});
