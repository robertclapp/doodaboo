import { spawn } from "node:child_process";
import { vaultPaths } from "../../src/lib/vault.js";
import { parseArgs, vaultRoot } from "../util.js";

/** Addresses that are reachable only from this machine. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

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

  // `next start` always runs as NODE_ENV=production, and the API middleware
  // refuses production traffic when no DOODABOO_API_TOKEN is configured — so
  // without an explicit signal the documented local server would 503 every
  // /api request. Bound to loopback, nothing off this machine can reach the
  // API, so mark the child process local and it stays open. Bound anywhere
  // else, the API reads and writes the whole vault over the network, so a
  // token is required; refuse up front with instructions rather than start a
  // server whose every API call fails.
  const loopback = LOOPBACK_HOSTS.has(host);
  const hasToken = Boolean(process.env.DOODABOO_API_TOKEN?.trim());
  if (!loopback && !hasToken) {
    process.stderr.write(
      [
        `doodaboo serve: --host ${host} exposes the HTTP API beyond this machine,`,
        `and no DOODABOO_API_TOKEN is set. The API reads and writes the whole`,
        `vault, so the server would refuse every /api request (503).`,
        ``,
        `Either bind to 127.0.0.1 (the default), or set a token:`,
        `  DOODABOO_API_TOKEN="$(openssl rand -hex 32)" doodaboo serve --host ${host}`,
        ``,
      ].join("\n"),
    );
    return 1;
  }

  process.stdout.write(
    `Serving doodaboo from ${paths.workspaceFile}\n  http://${host}:${port}\n`,
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DOODABOO_VAULT: paths.root,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  // Only a loopback bind may mark the process local; never let a stray
  // value from the parent environment leak into an exposed server.
  if (loopback) env.DOODABOO_API_LOCAL = "1";
  else delete env.DOODABOO_API_LOCAL;

  const cmd = values.dev ? "dev" : "start";
  const child = spawn("npx", ["next", cmd, "--port", port, "--hostname", host], {
    stdio: "inherit",
    env,
  });
  return new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
  });
}
