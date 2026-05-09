import { promises as fs, watch as fsWatch } from "node:fs";
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
 * Runs `mutator(current)` against the on-disk workspace, then saves
 * the result. This is the atomic primitive every CLI command + API
 * route should use; it loads, mutates, and writes in a single call.
 */
export async function withWorkspace<T>(
  mutator: (state: WorkspaceState) => Promise<{
    state: WorkspaceState;
    result: T;
  }> | { state: WorkspaceState; result: T },
  root = defaultVaultRoot(),
): Promise<T> {
  const current = await loadWorkspace(root);
  const next = await mutator(current);
  await saveWorkspace(next.state, root);
  return next.result;
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

function migrate(input: unknown): WorkspaceState {
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

  // No migrations required yet — version 1 is the only supported shape.
  // When the schema evolves, add migration steps here keyed on `version`.
  if (version !== WORKSPACE_VERSION) {
    obj.version = WORKSPACE_VERSION;
  }

  // Defensive: backfill arrays so a hand-edited vault that dropped a
  // field doesn't crash the consumer.
  const backfill = <K extends keyof WorkspaceState>(
    key: K,
    fallback: WorkspaceState[K],
  ): void => {
    if (!Array.isArray((obj as unknown as WorkspaceState)[key])) {
      (obj as unknown as WorkspaceState)[key] = fallback;
    }
  };
  backfill("users", []);
  backfill("labels", []);
  backfill("projects", []);
  backfill("tasks", []);
  backfill("posts", []);

  if (typeof obj.theme !== "string") obj.theme = "system";
  if (typeof obj.currentUserId !== "string") {
    const users = (obj as unknown as WorkspaceState).users;
    obj.currentUserId = users[0]?.id ?? "u_unknown";
  }

  return obj as unknown as WorkspaceState;
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
