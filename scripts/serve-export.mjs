#!/usr/bin/env node
/**
 * Serve ./out the way Tauri's webview will.
 *
 * Tauri does not run a web server; it embeds frontendDist and resolves each
 * request through its asset resolver (tauri/src/manager/mod.rs), which tries
 * in order:
 *
 *   <path>  ->  <path>.html  ->  <path>/index.html  ->  index.html
 *
 * and strips any query string or fragment before looking anything up. It
 * never returns 404 — a missing chunk, RSC payload, or page comes back as the
 * root index.html with status 200 and text/html. That last fallback is what
 * makes a bad route render the dashboard at the wrong URL instead of failing,
 * so an E2E run against this server catches exactly the class of bug
 * `next dev` (which has a real router) cannot.
 *
 *   node scripts/serve-export.mjs --port 3101      # playwright.config uses this
 *   E2E_TARGET=export npm run e2e
 */
import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const portArg = process.argv.indexOf("--port");
const port = Number(portArg > -1 ? process.argv[portArg + 1] : process.env.PORT ?? 3101);

const TYPES = {
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  map: "application/json",
  webmanifest: "application/manifest+json",
};

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Mirror tauri's get_asset: path, path.html, path/index.html, index.html. */
function resolve(pathname) {
  let p = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (p === "") p = "index.html";
  for (const candidate of [p, `${p}.html`, `${p}/index.html`, "index.html"]) {
    const abs = path.join(root, candidate);
    // Refuse anything that escapes out/ (a traversal would never reach
    // Tauri's resolver either).
    if (!abs.startsWith(root + path.sep) && abs !== root) continue;
    if (isFile(abs)) return abs;
  }
  return null;
}

if (!isFile(path.join(root, "index.html"))) {
  process.stderr.write(`[serve-export] no ${path.join(root, "index.html")} — run \`npm run build:tauri\` first\n`);
  process.exit(1);
}

http
  .createServer((req, res) => {
    // The URL constructor drops the query and fragment for us, like Tauri.
    const { pathname } = new URL(req.url ?? "/", "http://tauri.localhost");
    const file = resolve(pathname);
    if (!file) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("out/ has no index.html");
      return;
    }
    const ext = path.extname(file).slice(1);
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  })
  .listen(port, "127.0.0.1", () => {
    process.stdout.write(`[serve-export] serving ${root} at http://127.0.0.1:${port} (tauri fallback chain)\n`);
  });
