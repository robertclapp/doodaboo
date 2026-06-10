import {
  loadWorkspace,
  vaultExists,
  withWorkspace,
} from "./vault";
import { WorkspaceState } from "./mutations";

/**
 * Helpers shared by every Next.js API route handler.
 *
 * Routes only run server-side, so they import vault.ts directly. They
 * always operate against the vault on disk pointed at by
 * `DOODABOO_VAULT` (or `~/.doodaboo`). Each request is a load-mutate-
 * save cycle through `withWorkspace`, the same primitive the CLI uses,
 * so concurrent CLI + web edits stay consistent.
 */

export async function ensureVault(): Promise<{ ok: boolean; reason?: string }> {
  const exists = await vaultExists();
  if (!exists) {
    return {
      ok: false,
      reason:
        "No vault. Run `doodaboo init` to create one or set DOODABOO_VAULT to an existing vault path.",
    };
  }
  return { ok: true };
}

export async function readWorkspace(): Promise<WorkspaceState> {
  return loadWorkspace();
}

export async function mutateWorkspace<T>(
  fn: (state: WorkspaceState) => { state: WorkspaceState; result: T },
): Promise<T> {
  return withWorkspace(fn);
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

export function error(status: number, message: string): Response {
  return json({ error: message }, { status });
}

export async function safeJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Request body must be JSON.");
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((err: unknown) => {
    if (err instanceof ApiError) return error(err.status, err.message);
    if (err instanceof Error && err.name === "VaultNotFoundError") {
      return error(503, err.message);
    }
    // eslint-disable-next-line no-console
    console.error("[api] unhandled", err);
    return error(
      500,
      err instanceof Error ? err.message : "Internal server error",
    );
  });
}
