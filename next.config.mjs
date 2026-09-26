/** @type {import('next').NextConfig} */

/**
 * Tauri (desktop and mobile) ships a static bundle. scripts/build-tauri.mjs
 * sets DOODABOO_STATIC_EXPORT=1, parks the server-only surfaces (the HTTP
 * API, middleware, and the PWA/SEO metadata routes) outside src/, and runs
 * `next build` in export mode. Nothing else sets the variable, so the web
 * build and `next dev` — which `tauri dev` runs against devUrl — are
 * unchanged.
 */
const isStaticExport = process.env.DOODABOO_STATIC_EXPORT === "1";

/**
 * Id shapes, duplicated from src/lib/routes.ts ID_PATTERNS because this file
 * cannot import TypeScript. src/lib/routes.test.ts imports this config and
 * asserts each redirect embeds the matching ID_PATTERNS entry, and
 * e2e/legacy-urls.spec.ts proves the redirects end to end, so a drift here
 * fails a test rather than production.
 */
const ID = {
  post: "po_[A-Za-z0-9_-]+",
  project: "p_[A-Za-z0-9_-]+",
  task: "t_[A-Za-z0-9_-]+",
  playbook: "pb_[A-Za-z0-9_-]+",
};

const nextConfig = {
  reactStrictMode: true,

  ...(isStaticExport
    ? {
        output: "export",
        // No custom distDir: Next only writes the export to ./out (what
        // tauri.conf.json's frontendDist points at) when distDir is the
        // default; a custom one becomes the export directory itself. The
        // cost is that build:tauri overwrites the web build's .next, so run
        // `npm run build` again before `npm start` (documented in
        // docs/desktop.md).
        // The default image loader needs a server; the app uses no
        // next/image today, but the export refuses to build without this.
        images: { unoptimized: true },
      }
    : {
        // Security headers live here (not in vercel.json) so every host —
        // Vercel, Railway, bare `next start` — serves the same policy. Next
        // ignores headers() under output:'export' (there is no server to
        // send them), so they are only registered for the web build.
        async headers() {
          return [
            {
              source: "/(.*)",
              headers: [
                { key: "X-Frame-Options", value: "SAMEORIGIN" },
                { key: "X-Content-Type-Options", value: "nosniff" },
                {
                  key: "Referrer-Policy",
                  value: "strict-origin-when-cross-origin",
                },
                {
                  key: "Permissions-Policy",
                  value: "camera=(), microphone=(), geolocation=()",
                },
              ],
            },
            {
              source: "/manifest.webmanifest",
              headers: [
                { key: "Cache-Control", value: "public, max-age=86400" },
              ],
            },
          ];
        },

        // Record detail pages moved from path ids (/posts/<id>) to a static
        // path plus id query (/posts/view?id=<id>) so the same URLs work in
        // the Tauri static export — see src/lib/routes.ts. Old bookmarks and
        // external links keep working on the web via 308. The regex-
        // constrained params are the guard: /posts/new, /posts/lab and
        // /posts/view do not start with `po_`, so they are never caught.
        // Next ignores redirects() under output:'export', and inside Tauri
        // nothing ever emits an old-style URL, so this is web-only by nature.
        async redirects() {
          return [
            {
              source: `/projects/:pid(${ID.project})/tasks/:tid(${ID.task})`,
              destination: "/tasks/view?id=:tid",
              permanent: true,
            },
            {
              source: `/projects/:id(${ID.project})`,
              destination: "/projects/view?id=:id",
              permanent: true,
            },
            {
              source: `/posts/:id(${ID.post})`,
              destination: "/posts/view?id=:id",
              permanent: true,
            },
            {
              source: `/playbooks/:id(${ID.playbook})`,
              destination: "/playbooks/view?id=:id",
              permanent: true,
            },
          ];
        },
      }),
};

export default nextConfig;
