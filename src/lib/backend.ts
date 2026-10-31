/**
 * Which backend this build talks to.
 *
 * Local mode (the default): the workspace lives in localStorage on the web
 * and in the on-disk vault inside Tauri; no account, no server.
 *
 * Cloud mode: `NEXT_PUBLIC_CONVEX_URL` names a Convex deployment. Accounts,
 * shared workspaces and live sync come from there; the local vault is left
 * untouched so switching back loses nothing.
 *
 * The URL is inlined at build time, so the mode is a property of the build
 * (the web deployment, or the desktop/mobile bundle — see
 * scripts/build-tauri.mjs). One runtime escape hatch exists: a device can
 * force local mode with `localStorage["doodaboo-mode"] = "local"`, which is
 * what the connection banner's "work locally" link sets when the deployment
 * cannot be reached.
 */

export const MODE_KEY = "doodaboo-mode";
/** Persist key for device preferences (theme) in cloud mode; the local vault key stays `doodaboo-v1`. */
export const CLOUD_PREFS_KEY = "doodaboo-cloud-prefs";

export interface CloudConfig {
  /** The validated deployment URL, or null when this build is local-first. */
  url: string | null;
  /** Why a configured URL was rejected (shown in Settings → Cloud). */
  error?: string;
}

/**
 * The same rules the Convex client applies (`validateDeploymentUrl`): an
 * absolute http(s) URL that is not the `.convex.site` HTTP-actions host.
 * Validating here turns a typo in an env var into a Settings warning and a
 * working local-first app instead of a crash during render.
 */
export function parseConvexUrl(raw: string | undefined | null): CloudConfig {
  const value = raw?.trim();
  if (!value) return { url: null };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { url: null, error: `NEXT_PUBLIC_CONVEX_URL is not a valid URL: "${value}"` };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { url: null, error: `NEXT_PUBLIC_CONVEX_URL must start with https:// (got ${parsed.protocol})` };
  }
  if (parsed.hostname.endsWith(".convex.site")) {
    return {
      url: null,
      error: "NEXT_PUBLIC_CONVEX_URL points at the .convex.site HTTP host; use the .convex.cloud deployment URL",
    };
  }
  return { url: parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "")) };
}

export const cloud: CloudConfig = parseConvexUrl(process.env.NEXT_PUBLIC_CONVEX_URL);

/** True when this build was made with a valid deployment URL. */
export function isCloudBuild(): boolean {
  return cloud.url !== null;
}

/** The device-level override: run this cloud build as local-first. */
export function localOverride(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MODE_KEY) === "local";
  } catch {
    return false;
  }
}

export function setLocalOverride(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(MODE_KEY, "local");
    else window.localStorage.removeItem(MODE_KEY);
  } catch {
    // Storage unavailable: nothing to override.
  }
}

/**
 * Effective mode for this page load. Evaluated once by the modules that
 * need it (the store's persistence, the provider tree); a change of
 * override takes effect on the next load, which is how the UI applies it.
 */
export function isCloud(): boolean {
  return isCloudBuild() && !localOverride();
}

/** Host shown in the connection banner. */
export function cloudHost(): string {
  try {
    return cloud.url ? new URL(cloud.url).host : "";
  } catch {
    return cloud.url ?? "";
  }
}
