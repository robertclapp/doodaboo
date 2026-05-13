import { promises as fs, watch as fsWatch } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import os from "node:os";
import {
  emptyWorkspace,
  WorkspaceState,
  WORKSPACE_VERSION,
} from "./mutations";

/**
 * Vault — the file-system home for a workspace.
 *
 * A vault is a directory, by default `~/.doodaboo`, with this layout:
 *
 *   <vault>/
 *     workspace.json         # the canonical state
 *     backups/
 *       workspace-<iso>.json # rolling backups, last 20 retained
 *     plugins/               # user plugins (loaded by plugin system)
 *     exports/               # markdown exports etc.
 *
 * Reads atomically rehydrate WorkspaceState. Writes go through a
 * temp-file-then-rename dance so a crash never leaves a half-written
 * workspace.json on disk. Every successful write also drops a backup
 * so the user can roll back from history without external sync.
 */

export interface VaultPaths {
  root: string;
  workspaceFile: string;
  backupsDir: string;
  pluginsDir: string;
  exportsDir: string;
}

const MAX_BACKUPS = 20;

export function defaultVaultRoot(): string {
  return process.env.DOODABOO_VAULT ?? path.join(os.homedir(), ".doodaboo");
}

export function vaultPaths(root = defaultVaultRoot()): VaultPaths {
  const abs = path.resolve(root);
  return {
    root: abs,
    workspaceFile: path.join(abs, "workspace.json"),
    backupsDir: path.join(abs, "backups"),
    pluginsDir: path.join(abs, "plugins"),
    exportsDir: path.join(abs, "exports"),
  };
}

export async function vaultExists(root = defaultVaultRoot()): Promise<boolean> {
  const { workspaceFile } = vaultPaths(root);
  try {
    await fs.access(workspaceFile);
    return true;
  } catch {
    return false;
  }
}

export async function initVault(
  root = defaultVaultRoot(),
  opts: { force?: boolean } = {},
): Promise<VaultPaths> {
  const paths = vaultPaths(root);
  if ((await vaultExists(root)) && !opts.force) {
    throw new Error(
      `Vault already exists at ${paths.workspaceFile}. Pass --force to overwrite.`,
    );
  }
  await fs.mkdir(paths.root, { recursive: true });
  await fs.mkdir(paths.backupsDir, { recursive: true });
  await fs.mkdir(paths.pluginsDir, { recursive: true });
  await fs.mkdir(paths.exportsDir, { recursive: true });
  await saveWorkspace(emptyWorkspace(), root);
  return paths;
}

export async function loadWorkspace(
  root = defaultVaultRoot(),
): Promise<WorkspaceState> {
  const paths = vaultPaths(root);
  let raw: string;
  try {
    raw = await fs.readFile(paths.workspaceFile, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VaultNotFoundError(paths.workspaceFile);
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new VaultCorruptError(
      `workspace.json is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return migrate(parsed);
}

export async function saveWorkspace(
  state: WorkspaceState,
  root = defaultVaultRoot(),
): Promise<void> {
  const paths = vaultPaths(root);
  await fs.mkdir(paths.root, { recursive: true });
  await fs.mkdir(paths.backupsDir, { recursive: true });

  const json = JSON.stringify(state, null, 2);
  const tmp = `${paths.workspaceFile}.tmp-${process.pid}`;
  await fs.writeFile(tmp, json, "utf-8");
  await fs.rename(tmp, paths.workspaceFile);

  // Rolling backup. Best-effort — never fail the save because a backup
  // copy hit a race. Trim the oldest entries beyond MAX_BACKUPS.
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(
      path.join(paths.backupsDir, `workspace-${stamp}.json`),
      json,
      "utf-8",
    );
    const backups = (await fs.readdir(paths.backupsDir))
      .filter((n) => n.startsWith("workspace-") && n.endsWith(".json"))
      .sort();
    while (backups.length > MAX_BACKUPS) {
      const oldest = backups.shift();
      if (!oldest) break;
      await fs.unlink(path.join(paths.backupsDir, oldest));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[doodaboo] backup write failed (workspace itself was saved): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * In-process mutex, queued per vault root. Prevents two awaits-in-the-
 * same-process (e.g. two concurrent API requests) from racing.
 */
const vaultLocks = new Map<string, Promise<unknown>>();

function withInProcessLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = vaultLocks.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  const tail = next.catch(() => undefined);
  vaultLocks.set(key, tail);
  tail.finally(() => {
    if (vaultLocks.get(key) === tail) vaultLocks.delete(key);
  });
  return next;
}

/**
 * Cross-process file lock. Independent CLI invocations and a running
 * `doodaboo serve` would otherwise race the in-process mutex (each
 * process has its own `vaultLocks` Map). We acquire an exclusive
 * lock via `fs.open(...'wx')` — POSIX-atomic create-or-fail — and
 * spin with backoff on EEXIST. Stale locks from a crashed process
 * are reaped after `STALE_LOCK_MS`.
 */
const LOCK_RETRY_MS = 25;
const LOCK_MAX_WAIT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

async function acquireFileLock(lockPath: string): Promise<() => Promise<void>> {
  const start = Date.now();
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
      await handle.close();
      return async () => {
        try {
          await fs.unlink(lockPath);
        } catch {
          // Best-effort: stale-lock cleanup will pick it up.
        }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      // Reap stale locks left by crashed processes so we don't wait
      // forever after a SIGKILL.
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          await fs.unlink(lockPath).catch(() => undefined);
          continue;
        }
      } catch {
        // Lock file vanished between EEXIST and stat — retry.
        continue;
      }
      if (Date.now() - start > LOCK_MAX_WAIT_MS) {
        throw new Error(
          `Timed out waiting for vault lock at ${lockPath}. Another doodaboo process may be stuck.`,
        );
      }
      await sleep(LOCK_RETRY_MS + Math.floor(Math.random() * 25));
    }
  }
}

/**
 * Runs `mutator(current)` against the on-disk workspace, then saves
 * the result. Serialised per vault root by both an in-process queue
 * (for fast intra-process awaits) and a `<vault>/.lock` file (for
 * inter-process safety between CLI invocations and a running
 * `doodaboo serve`). Without these, two readers can each take a
 * `current`, both mutate, and the second `saveWorkspace` clobbers the
 * first edit. The temp-file-and-rename strategy in `saveWorkspace`
 * only guards against torn files on disk; it does not prevent lost
 * updates.
 */
export async function withWorkspace<T>(
  mutator: (state: WorkspaceState) => Promise<{
    state: WorkspaceState;
    result: T;
  }> | { state: WorkspaceState; result: T },
  root = defaultVaultRoot(),
): Promise<T> {
  const key = path.resolve(root);
  const lockPath = path.join(key, ".lock");
  return withInProcessLock(key, async () => {
    const release = await acquireFileLock(lockPath);
    try {
      const current = await loadWorkspace(root);
      const next = await mutator(current);
      await saveWorkspace(next.state, root);
      return next.result;
    } finally {
      await release();
    }
  });
}

/**
 * Watch the workspace file for changes. Useful in `serve` mode so a
 * sync tool (Git, iCloud, Syncthing) updating the file makes the API
 * pick up new state without a restart.
 */
export function watchWorkspace(
  callback: (state: WorkspaceState) => void,
  root = defaultVaultRoot(),
): () => void {
  const paths = vaultPaths(root);
  let timer: NodeJS.Timeout | null = null;
  const watcher = fsWatch(paths.root, (_event, filename) => {
    if (filename !== "workspace.json") return;
    // Debounce rapid editor writes.
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      loadWorkspace(root)
        .then(callback)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn(`[doodaboo] reload failed: ${err.message}`);
        });
    }, 80);
  });
  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}

// ── Migrations ──────────────────────────────────────────────────────────────

/**
 * `migrate` is the only path that produces a `WorkspaceState` from
 * untrusted JSON. It throws on obvious corruption and backfills
 * structurally incomplete records so downstream code can assume every
 * `task.comments`, `task.activity`, `task.labelIds`, `post.snapshots`,
 * `project.memberIds` etc. is at least an empty array — never
 * `undefined`. The `import` CLI and `PUT /api/workspace` both route
 * client-supplied JSON through here, not just `loadWorkspace`.
 */
export function migrate(input: unknown): WorkspaceState {
  if (!input || typeof input !== "object") {
    throw new VaultCorruptError("workspace.json root is not an object");
  }
  const obj = input as Record<string, unknown> & { version?: unknown };
  const version = typeof obj.version === "number" ? obj.version : 0;

  if (version > WORKSPACE_VERSION) {
    throw new VaultCorruptError(
      `workspace version ${version} is newer than this build supports (${WORKSPACE_VERSION}). Upgrade doodaboo.`,
    );
  }

  // No version-keyed migration steps yet — version 1 is the only
  // supported shape. When the schema evolves, key migrations here.
  obj.version = WORKSPACE_VERSION;

  const backfillArray = <K extends keyof WorkspaceState>(
    key: K,
    fallback: WorkspaceState[K],
  ): void => {
    if (!Array.isArray((obj as unknown as WorkspaceState)[key])) {
      (obj as unknown as WorkspaceState)[key] = fallback;
    }
  };
  backfillArray("users", []);
  backfillArray("labels", []);
  backfillArray("projects", []);
  backfillArray("tasks", []);
  backfillArray("posts", []);

  // Nested shape backfills — guard against hand-edited or partial JSON
  // that lost a field. Doing this once at the trust boundary means
  // mutations/UI can assume the invariants below hold.
  const state = obj as unknown as WorkspaceState;
  for (const project of state.projects) {
    if (!Array.isArray(project.memberIds)) project.memberIds = [];
    if (typeof project.nextTaskNumber !== "number") {
      const max = state.tasks
        .filter((t) => t.projectId === project.id)
        .reduce((m, t) => Math.max(m, t.number), 0);
      project.nextTaskNumber = max + 1;
    }
  }
  for (const task of state.tasks) {
    if (!Array.isArray(task.labelIds)) task.labelIds = [];
    if (!Array.isArray(task.comments)) task.comments = [];
    if (!Array.isArray(task.activity)) task.activity = [];
  }
  for (const post of state.posts) {
    if (!Array.isArray(post.snapshots)) post.snapshots = [];
    if (!post.content || typeof post.content !== "object") {
      post.content = {
        hook: "",
        caption: "",
        hashtags: [],
        transcript: "",
        format: "video",
        hasTrendingAudio: false,
      };
    } else if (!Array.isArray(post.content.hashtags)) {
      post.content.hashtags = [];
    }
    // Validate snapshot numeric fields. The addSnapshot mutation already
    // guards live writes, but `import` and hand-edited vault files reach
    // this point with the JSON deserialized as-is — non-finite values
    // would propagate to scoreLive and crash it. We coerce non-finite
    // numeric fields to 0 rather than silently dropping the snapshot so
    // the user can still see and fix the post.
    for (const snap of post.snapshots) {
      const bag = snap as unknown as Record<string, unknown>;
      const requireFinite = (k: keyof typeof snap) => {
        const v = bag[k as string];
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
          bag[k as string] = 0;
        }
      };
      requireFinite("atMinutes");
      requireFinite("impressions");
      requireFinite("views");
      requireFinite("likes");
      requireFinite("comments");
      requireFinite("shares");
      requireFinite("saves");
      if (
        snap.retentionPct != null &&
        (typeof snap.retentionPct !== "number" ||
          !Number.isFinite(snap.retentionPct) ||
          snap.retentionPct < 0 ||
          snap.retentionPct > 100)
      ) {
        snap.retentionPct = undefined;
      }
      if (
        snap.watchTimeAvgSec != null &&
        (typeof snap.watchTimeAvgSec !== "number" ||
          !Number.isFinite(snap.watchTimeAvgSec) ||
          snap.watchTimeAvgSec < 0)
      ) {
        snap.watchTimeAvgSec = undefined;
      }
    }
  }

  if (typeof obj.theme !== "string") obj.theme = "system";
  if (typeof obj.currentUserId !== "string" || !obj.currentUserId) {
    obj.currentUserId = state.users[0]?.id ?? "u_unknown";
  }

  return state;
}

export class VaultNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(
      `No vault at ${path}. Run \`doodaboo init\` to create one or set DOODABOO_VAULT.`,
    );
    this.name = "VaultNotFoundError";
  }
}

export class VaultCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultCorruptError";
  }
}
