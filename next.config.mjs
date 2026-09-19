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

const nextConfig = {
  reactStrictMode: true,

  ...(isStaticExport
    ? {
        output: "export",
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
      }),
};

export default nextConfig;
