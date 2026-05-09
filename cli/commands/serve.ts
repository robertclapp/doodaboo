import { spawn } from "node:child_process";
import { vaultPaths } from "../../src/lib/vault.js";
import { parseArgs, vaultRoot } from "../util.js";

/**
 * Boots the Next.js production server with DOODABOO_VAULT pointing at
 * the chosen vault. The server's API routes load and persist through
 * `withWorkspace`, so the running app reads/writes the same files the
 * CLI does — they share state.
 */
export async function runServe(argv: string[]): Promise<number> {
  const { values } = parseArgs<{
    port?: string;
    host?: string;
    dev?: boolean;
  }>(argv, {
    port: { type: "string", short: "p" },
    host: { type: "string", short: "H" },
    dev: { type: "boolean" },
  });

  const root = vaultRoot(values);
  const paths = vaultPaths(root);
  const port = values.port ?? "3100";
  const host = values.host ?? "127.0.0.1";

  process.stdout.write(
    `Serving doodaboo from ${paths.workspaceFile}\n  http://${host}:${port}\n`,
  );

  const cmd = values.dev ? "dev" : "start";
  const child = spawn("npx", ["next", cmd, "--port", port, "--hostname", host], {
    stdio: "inherit",
    env: {
      ...process.env,
      DOODABOO_VAULT: paths.root,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  return new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
  });
}
