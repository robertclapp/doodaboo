/**
 * Shared test helpers.
 *
 * These centralize three patterns that were previously copy-pasted across
 * the test suite — each one a place where a missed restore would leak
 * state into sibling tests (the hardest class of flake to diagnose):
 *
 *  - `silenceConsole`  — stub noisy console methods around a block, with a
 *    guaranteed restore even if the block throws.
 *  - `createTempVaultEnv` / `withTempVault` — stand up an isolated vault in
 *    a temp dir, point `DOODABOO_VAULT` at it, and tear both down.
 *
 * Importing this module has no side effects; it is only pulled in by
 * `*.test.ts` files, never by application code.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { initVault } from "./vault";

type ConsoleMethod = "log" | "warn" | "error";

/**
 * Run `fn` with the named console methods stubbed to no-ops, restoring the
 * originals afterward (even on throw). Use when a code path is expected to
 * log a warning/error you don't want polluting test output.
 */
export async function silenceConsole<T>(
  methods: ConsoleMethod[],
  fn: () => T | Promise<T>,
): Promise<T> {
  const originals = methods.map((m) => [m, console[m]] as const);
  for (const m of methods) console[m] = () => {};
  try {
    return await fn();
  } finally {
    for (const [m, orig] of originals) console[m] = orig;
  }
}

export interface TempVaultEnv {
  root: string;
  /** Restores DOODABOO_VAULT to its prior value and removes the temp dir. */
  restore: () => Promise<void>;
}

/**
 * Create a temp directory, optionally initialise a vault inside it, and
 * point `DOODABOO_VAULT` at it. Returns the root and a `restore` that undoes
 * both the env mutation and the directory. Pass `{ init: false }` to get a
 * directory with NO workspace.json (e.g. to exercise "vault missing" paths).
 */
export async function createTempVaultEnv(
  opts: { init?: boolean } = {},
): Promise<TempVaultEnv> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "doodaboo-test-"));
  if (opts.init !== false) await initVault(root, { force: true });
  const prev = process.env.DOODABOO_VAULT;
  process.env.DOODABOO_VAULT = root;
  return {
    root,
    restore: async () => {
      if (prev === undefined) delete process.env.DOODABOO_VAULT;
      else process.env.DOODABOO_VAULT = prev;
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

/**
 * Run `fn` against a fresh isolated vault, tearing everything down after
 * (even on throw). The callback receives the vault root.
 */
export async function withTempVault<T>(
  fn: (root: string) => T | Promise<T>,
  opts: { init?: boolean } = {},
): Promise<T> {
  const { root, restore } = await createTempVaultEnv(opts);
  try {
    return await fn(root);
  } finally {
    await restore();
  }
}
