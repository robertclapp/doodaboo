#!/usr/bin/env node
/**
 * build:tauri — produce the static frontend bundle that Tauri ships.
 *
 * tauri.conf.json names this as `beforeBuildCommand` and points
 * `frontendDist` at ../out. Desktop (macOS/Linux/Windows) and mobile
 * (Android/iOS) all consume the same bundle, so this is the one place the
 * web app is turned into files.
 *
 * Why a script rather than `next build` alone: a Next.js static export
 * (`output: "export"`) cannot contain server-only surfaces, and Next
 * discovers routes by scanning the filesystem — there is no config-level
 * way to exclude a route handler or middleware from an export. So for the
 * duration of the build, the server-only files are parked outside src/,
 * and restored afterwards no matter how the build ends (success, failure,
 * or Ctrl-C). None of them are used inside Tauri:
 *
 *   - src/app/api/**        the HTTP API (14 force-dynamic route handlers);
 *                           the Tauri app persists through invoke(), not HTTP
 *   - src/middleware.ts     bearer-token auth for that API; unsupported
 *                           under export
 *   - manifest/sitemap/robots/opengraph-image/icon/apple-icon
 *                           PWA + SEO metadata routes, three on the edge
 *                           runtime; meaningless for an app bundle
 *
 * The export itself is switched on in next.config.mjs by
 * DOODABOO_STATIC_EXPORT=1, which only this script sets. `next dev` (what
 * `tauri dev` runs against devUrl) is untouched, so the desktop dev loop
 * keeps SSR, the API, and hot reload.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STASH = path.join(root, ".tauri-build-stash");
const SERVER_ONLY = [
  "src/app/api",
  "src/middleware.ts",
  "src/app/manifest.ts",
  "src/app/sitemap.ts",
  "src/app/robots.ts",
  "src/app/opengraph-image.tsx",
  "src/app/icon.tsx",
  "src/app/apple-icon.tsx",
];

const log = (msg) => process.stdout.write(`[build:tauri] ${msg}\n`);
const fail = (msg) => {
  process.stderr.write(`[build:tauri] ${msg}\n`);
  process.exit(1);
};

/** Stash entries are keyed by the original path with "/" -> "__". */
const stashKey = (rel) => rel.replaceAll("/", "__");

/**
 * Put everything in the stash back where it came from. Idempotent, so it
 * is safe to call from the normal path, the failure path, a signal
 * handler, and at startup to repair a previous interrupted run.
 */
function restore() {
  if (!existsSync(STASH)) return 0;
  let restored = 0;
  for (const rel of SERVER_ONLY) {
    const parked = path.join(STASH, stashKey(rel));
    const home = path.join(root, rel);
    if (!existsSync(parked)) continue;
    if (existsSync(home)) {
      // Both exist: something was written at the original path while it
      // was parked (a `git restore` after a hard-killed build, an editor
      // save, a build re-creating it). The parked copy is the pre-build
      // source, but the other may hold newer work — never delete it. Move
      // it aside and say so loudly; the developer reconciles.
      const aside = path.join(STASH, "conflicts", `${stashKey(rel)}-${process.pid}-${Date.now()}`);
      mkdirSync(path.dirname(aside), { recursive: true });
      renameSync(home, aside);
      process.stderr.write(
        `[build:tauri] WARNING: ${rel} existed both in the tree and in the stash; the tree copy was moved to ${path.relative(root, aside)} — reconcile it, then delete it\n`,
      );
    }
    renameSync(parked, home);
    restored++;
  }
  const leftovers = readdirSync(STASH);
  if (leftovers.length === 0) rmSync(STASH, { recursive: true, force: true });
  else if (leftovers.includes("conflicts")) {
    process.stderr.write(`[build:tauri] ${path.relative(root, STASH)}/conflicts holds files moved aside; delete it once reconciled\n`);
  }
  return restored;
}

function park() {
  mkdirSync(STASH, { recursive: true });
  let parked = 0;
  for (const rel of SERVER_ONLY) {
    const home = path.join(root, rel);
    if (!existsSync(home)) continue;
    renameSync(home, path.join(STASH, stashKey(rel)));
    parked++;
  }
  return parked;
}

// A previous run that was killed mid-build leaves files in the stash and
// gaps in src/. Repair that first rather than building a broken tree.
const repaired = restore();
if (repaired) log(`restored ${repaired} path(s) left parked by an interrupted run`);

// `npm run tauri:restore`: repair the tree after a build that was killed
// hard (SIGKILL, power loss) without also running a build.
if (process.argv.includes("--restore-only")) {
  log(repaired ? "tree repaired" : "nothing was parked; tree already clean");
  process.exit(0);
}

let restoredOnExit = false;
const restoreOnce = () => {
  if (restoredOnExit) return;
  restoredOnExit = true;
  const n = restore();
  if (n) log(`restored ${n} server-only path(s)`);
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    restoreOnce();
    process.exit(130);
  });
}
process.on("exit", restoreOnce);

const parked = park();
log(`parked ${parked} server-only path(s); running next build in export mode`);

rmSync(path.join(root, "out"), { recursive: true, force: true });
// Run Next's own bin under the current node rather than through `npx`:
// `tauri build` invokes this script on Windows too, where `npx` is a .cmd
// shim that spawnSync cannot start without a shell (and Node ≥ 20.12 refuses
// .cmd without one). The same pattern as bin/doodaboo.js.
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const result = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    DOODABOO_STATIC_EXPORT: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
restoreOnce();

if (result.error) fail(`could not start next build: ${result.error.message}`);
if (result.status !== 0) fail(`next build exited with ${result.status ?? `signal ${result.signal}`}`);
validateOut();
log("static bundle ready in ./out");

/**
 * The bundle is only as good as what Tauri can resolve from it, so assert
 * the shape rather than trusting a zero exit code:
 *   - every page the app links to exists as a file (Tauri's resolver falls
 *     back to index.html for anything missing — silently rendering the
 *     dashboard at the wrong URL instead of failing);
 *   - no dynamic-segment or placeholder page leaked in (`[id]`, `_.html`),
 *     which would mean a route regressed to a shape the export can't serve;
 *   - no server-only surface was built (the API would be dead weight);
 *   - every parked path is back in the tree.
 */
function validateOut() {
  const out = path.join(root, "out");
  const pages = [
    "index.html", "index.txt", "404.html",
    "inbox.html", "my-issues.html", "team.html", "labels.html", "settings.html",
    "posts.html", "posts/view.html", "posts/view.txt", "posts/new.html",
    "posts/lab.html", "posts/insights.html", "posts/compare.html",
    "projects.html", "projects/view.html", "projects/new.html",
    "tasks/view.html", "playbooks.html", "playbooks/view.html",
  ];
  const missing = pages.filter((p) => !existsSync(path.join(out, p)));
  if (missing.length) fail(`export is missing expected page(s): ${missing.join(", ")}`);

  const leaked = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      // Normalize to "/" so the patterns below hold on Windows too.
      const rel = path.relative(out, path.join(dir, name.name)).split(path.sep).join("/");
      if (/\[[^\]]+\]/.test(rel) || /(^|\/)_\.html$/.test(rel) || /^api(\/|$)/.test(rel)) leaked.push(rel);
      if (name.isDirectory()) walk(path.join(dir, name.name));
    }
  };
  walk(out);
  if (leaked.length) fail(`export contains paths the app can't serve under Tauri: ${leaked.join(", ")}`);

  const notRestored = SERVER_ONLY.filter((rel) => !existsSync(path.join(root, rel)));
  if (notRestored.length) fail(`server-only path(s) not restored after build: ${notRestored.join(", ")}`);
  log(`validated ${pages.length} pages, no leaked dynamic/API paths, tree restored`);
}
