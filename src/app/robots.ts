import { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://doodaboo.example.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Per-record detail views (/posts/view?id=…, /tasks/view?id=…) read
        // localStorage-bound records and have nothing crawlable; explicitly
        // disallow to avoid wasted crawl budget. See src/lib/routes.ts.
        disallow: ["/posts/view", "/projects/view", "/tasks/view", "/playbooks/view"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
