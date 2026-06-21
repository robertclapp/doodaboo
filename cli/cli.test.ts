/**
 * End-to-end CLI smoke tests.
 *
 * Each test spawns `tsx cli/index.ts <command>` against a fresh temp
 * vault, asserts on exit code and stdout, and verifies on-disk effects.
 * Focused on the highest-impact gaps surfaced in the coverage analysis:
 *   - `post snap` numeric validation (the boundary against NaN on disk)
 *   - `task set` clear-assignee semantics
 *   - `export --markdown` safeFilename traversal defense
 *   - basic init/list smoke
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(__dirname, "..");
const CLI = path.join(REPO, "cli", "index.ts");

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

// Forward only the vars the spawned `tsx` / Node / npx actually need to
// start. We deliberately do NOT inherit the full parent env:
//   - DOODABOO_VAULT inherited from the developer's shell would silently
//     target their real vault if a future test omitted both --vault and a
//     positional path.
//   - Secrets like GITHUB_TOKEN / OPENAI_API_KEY etc. have no business in
//     a CLI test child and shouldn't be exposed to a crash dump or stderr.
const ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "NODE_PATH",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "SHELL",
  "USER",
  // npm / npx caches and prefixes — needed for `npx --no-install tsx`.
  "npm_config_cache",
  "npm_config_prefix",
  "NPM_CONFIG_CACHE",
  "NPM_CONFIG_PREFIX",
] as const;

function safeEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  // Next.js's ambient ProcessEnv augmentation marks NODE_ENV as a
  // required string. Start from {} but cast to satisfy the structural
  // requirement; spawnSync inherits whatever is set anyway.
  const out: NodeJS.ProcessEnv = {} as NodeJS.ProcessEnv;
  for (const k of ENV_ALLOWLIST) {
    const v = process.env[k];
    if (v !== undefined) out[k] = v;
  }
  return { ...out, ...extra };
}

function run(args: string[], extraEnv: Record<string, string> = {}): RunResult {
  const res = spawnSync(
    "npx",
    ["--no-install", "tsx", CLI, ...args],
    {
      cwd: REPO,
      env: safeEnv(extraEnv),
      encoding: "utf-8",
    },
  );
  return {
    status: res.status ?? -1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

let vaultRoot: string;

beforeEach(async () => {
  vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "doodaboo-cli-"));
});

afterEach(async () => {
  await fs.rm(vaultRoot, { recursive: true, force: true });
});

describe("doodaboo --help", () => {
  it("prints help and exits 0", () => {
    const r = run(["--help"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage:\s*doodaboo/);
  });

  it("unknown commands exit 1", () => {
    const r = run(["does-not-exist"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Unknown command/);
  });
});

describe("doodaboo init", () => {
  it("creates a vault at the given path", () => {
    const root = path.join(vaultRoot, "v");
    const r = run(["init", root]);
    assert.equal(r.status, 0);
    // The vault should exist now.
    const stat = require("node:fs").statSync(path.join(root, "workspace.json"));
    assert.ok(stat.isFile());
  });

  it("refuses to init over an existing vault without --force", () => {
    const root = path.join(vaultRoot, "v");
    run(["init", root]);
    const r = run(["init", root]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /already exists/);
  });

  it("supports --force to overwrite", () => {
    const root = path.join(vaultRoot, "v");
    run(["init", root]);
    const r = run(["init", root, "--force"]);
    assert.equal(r.status, 0);
  });
});

describe("doodaboo status --json", () => {
  it("returns machine-readable summary", () => {
    run(["init", vaultRoot]);
    const r = run(["status", "--json", "--vault", vaultRoot]);
    assert.equal(r.status, 0);
    const body = JSON.parse(r.stdout);
    assert.equal(typeof body.users, "number");
    assert.equal(typeof body.projects, "number");
  });
});

describe("doodaboo task set --assignee=none", () => {
  it("clears the assignee on an existing task", () => {
    run(["init", vaultRoot]);
    // Find a task that has an assignee.
    const list = run([
      "task",
      "list",
      "--json",
      "--vault",
      vaultRoot,
    ]);
    const tasks = JSON.parse(list.stdout) as any[];
    const assigned = tasks.find((t) => t.assigneeId);
    assert.ok(assigned, "expected a seeded task to have an assignee");

    const set = run([
      "task",
      "set",
      assigned.id,
      "--assignee=none",
      "--vault",
      vaultRoot,
    ]);
    assert.equal(set.status, 0);

    const after = run([
      "task",
      "list",
      "--json",
      "--vault",
      vaultRoot,
    ]);
    const updated = (JSON.parse(after.stdout) as any[]).find(
      (t) => t.id === assigned.id,
    );
    assert.ok(!updated.assigneeId, "assigneeId should be cleared");
  });

  it("leaves assignee unchanged when --assignee is not provided", () => {
    run(["init", vaultRoot]);
    const before = JSON.parse(
      run(["task", "list", "--json", "--vault", vaultRoot]).stdout,
    ) as any[];
    const target = before.find((t) => t.assigneeId);
    assert.ok(target);

    const r = run([
      "task",
      "set",
      target.id,
      "--status=in_progress",
      "--vault",
      vaultRoot,
    ]);
    assert.equal(r.status, 0);

    const after = JSON.parse(
      run(["task", "list", "--json", "--vault", vaultRoot]).stdout,
    ) as any[];
    const updated = after.find((t) => t.id === target.id);
    assert.equal(updated.assigneeId, target.assigneeId);
  });
});

describe("doodaboo post snap (numeric guards)", () => {
  function firstPostId(): string {
    const r = run(["post", "list", "--json", "--vault", vaultRoot]);
    return (JSON.parse(r.stdout) as any[])[0].id;
  }

  it("rejects non-numeric --at with a helpful error", () => {
    run(["init", vaultRoot]);
    const id = firstPostId();
    const r = run([
      "post",
      "snap",
      id,
      "--at=foo",
      "--vault",
      vaultRoot,
    ]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--at must be a finite number/);
  });

  it("rejects negative engagement counts", () => {
    run(["init", vaultRoot]);
    const id = firstPostId();
    const r = run([
      "post",
      "snap",
      id,
      "--at=10",
      "--views=-5",
      "--vault",
      vaultRoot,
    ]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /non-negative/);
  });

  it("rejects retention > 100", () => {
    run(["init", vaultRoot]);
    const id = firstPostId();
    const r = run([
      "post",
      "snap",
      id,
      "--at=10",
      "--retention=150",
      "--vault",
      vaultRoot,
    ]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /between 0 and 100/);
  });

  it("accepts a valid snapshot", () => {
    run(["init", vaultRoot]);
    const id = firstPostId();
    const r = run([
      "post",
      "snap",
      id,
      "--at=15",
      "--views=1000",
      "--likes=50",
      "--retention=55",
      "--vault",
      vaultRoot,
    ]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Snapshot recorded at T\+15m/);
  });
});

describe("doodaboo export --markdown (safeFilename traversal defense)", () => {
  it("never writes outside the target directory even for traversal-y project keys", async () => {
    run(["init", vaultRoot]);

    // Hand-edit the vault to inject a malicious project.key.
    const workspaceFile = path.join(vaultRoot, "workspace.json");
    const state = JSON.parse(await fs.readFile(workspaceFile, "utf-8"));
    state.projects.push({
      id: "p_evil",
      key: "../../../etc/passwd",
      name: "Evil",
      description: "",
      status: "todo",
      priority: "medium",
      memberIds: [],
      createdAt: state.projects[0].createdAt,
      updatedAt: state.projects[0].updatedAt,
      icon: "E",
      accent: "#000",
      nextTaskNumber: 1,
    });
    state.posts.push({
      id: "../../../etc/shadow",
      title: "Evil",
      platform: "tiktok",
      status: "draft",
      threshold: { metric: "views", value: 1, window: "7d" },
      snapshots: [],
      content: {
        hook: "",
        caption: "",
        hashtags: [],
        transcript: "",
        format: "video",
        hasTrendingAudio: false,
      },
      context: {
        audienceSize: 0,
        accountAvgViews: 0,
        postingHour: 12,
        dayOfWeek: 2,
        topicCategory: "general",
        novelty: 3,
        emotion: 3,
        trendMatch: 3,
        sentiment: "neutral",
      },
      createdAt: state.posts[0]?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await fs.writeFile(workspaceFile, JSON.stringify(state, null, 2), "utf-8");

    const target = path.join(vaultRoot, "out");

    // Sentinel + parent-tree snapshot, so we catch a regression that
    // escapes upward by one level (e.g. into vaultRoot/ siblings of out/)
    // without going all the way to /etc/. Walking only `target` would
    // miss those, leaving the test green on a real traversal regression.
    const sentinelDir = path.join(vaultRoot, "sentinel");
    await fs.mkdir(sentinelDir, { recursive: true });
    const sentinelPath = path.join(sentinelDir, "untouched");
    await fs.writeFile(sentinelPath, "do not modify", "utf-8");
    const beforeSiblings = (await fs.readdir(vaultRoot)).sort();

    const r = run([
      "export",
      "--markdown",
      target,
      "--vault",
      vaultRoot,
    ]);
    assert.equal(r.status, 0);

    async function walk(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...(await walk(full)));
        else out.push(full);
      }
      return out;
    }

    // 1. Every file inside `target` is genuinely inside target — no
    //    `../` escapes that resolve back inside it via a circuitous path.
    const written = await walk(target);
    for (const f of written) {
      assert.ok(
        path.resolve(f).startsWith(path.resolve(target) + path.sep),
        `path traversal inside target: ${f}`,
      );
    }

    // 2. The vault root's direct child set is exactly what it was before
    //    export (modulo `out/` itself), so no new sibling directories
    //    were created by a one-level upward escape.
    const afterSiblings = (await fs.readdir(vaultRoot)).sort();
    const newSiblings = afterSiblings.filter(
      (n) => !beforeSiblings.includes(n) && n !== "out",
    );
    assert.deepEqual(newSiblings, [], "unexpected siblings of out/ appeared");

    // 3. The sentinel outside target is byte-identical — no overwrite.
    assert.equal(await fs.readFile(sentinelPath, "utf-8"), "do not modify");

    // 4. Belt-and-suspenders: the canonical exploit target wasn't touched.
    await assert.rejects(fs.access("/etc/passwd.md"));
  });
});
