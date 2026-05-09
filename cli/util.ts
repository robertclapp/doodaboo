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

export function emit(json: boolean | undefined, payload: unknown, lines: () => string): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${lines()}\n`);
  }
}

export function require<T>(v: T | undefined, name: string): T {
  if (v === undefined || v === null) {
    throw new UsageError(`Missing required option: --${name}`);
  }
  return v;
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

const PAD = 22;
export function row(...cells: (string | number | undefined)[]): string {
  return cells
    .map((c, i) => {
      const s = c === undefined || c === null ? "—" : String(c);
      return i === cells.length - 1 ? s : s.padEnd(PAD);
    })
    .join(" ");
}
