import { parseArgs as nodeParseArgs, ParseArgsConfig } from "node:util";
import { defaultVaultRoot } from "../src/lib/vault.js";

export interface ParseResult<O> {
  values: O;
  positionals: string[];
}

/**
 * Tiny wrapper around Node's parseArgs that always allows positional
 * arguments and a few CLI-wide options (--vault, --json) without the
 * caller having to repeat them.
 */
export function parseArgs<O extends Record<string, unknown>>(
  argv: string[],
  options: NonNullable<ParseArgsConfig["options"]>,
): ParseResult<O & { vault?: string; json?: boolean }> {
  const merged: NonNullable<ParseArgsConfig["options"]> = {
    vault: { type: "string" },
    json: { type: "boolean" },
    ...options,
  };
  const result = nodeParseArgs({
    args: argv,
    options: merged,
    allowPositionals: true,
    strict: true,
  });
  return result as unknown as ParseResult<
    O & { vault?: string; json?: boolean }
  >;
}

export function vaultRoot(values: { vault?: string }): string {
  return values.vault ?? defaultVaultRoot();
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function fail(message: string): never {
  throw new UsageError(message);
}

/**
 * Coerce a CLI flag to a finite, non-negative number or throw with a
 * helpful message. Catches typos like `--at=foo` (NaN), `--at=` (empty
 * string would coerce to 0 silently otherwise), negative counts, and
 * Infinity before they reach the vault.
 */
export function nonneg(raw: string | undefined, flag: string): number {
  if (raw === undefined || raw === "") {
    fail(`Missing required flag: --${flag}`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    fail(`--${flag} must be a finite number; got "${raw}".`);
  }
  if (n < 0) {
    fail(`--${flag} must be non-negative; got ${n}.`);
  }
  return n;
}

export function bounded(
  raw: string | undefined,
  flag: string,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw === "") {
    fail(`Missing required flag: --${flag}`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    fail(`--${flag} must be a finite number; got "${raw}".`);
  }
  if (n < min || n > max) {
    fail(`--${flag} must be between ${min} and ${max}; got ${n}.`);
  }
  return n;
}

const PAD = 22;
export function row(...cells: (string | number | undefined)[]): string {
  return cells
    .map((c, i) => {
      const s = c === undefined || c === null ? "—" : String(c);
      return i === cells.length - 1 ? s : s.padEnd(PAD);
    })
    .join(" ");
}
