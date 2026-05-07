import { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://doodaboo.example.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Per-record dynamic surfaces are localStorage-bound and have nothing
        // crawlable; explicitly disallow to avoid wasted crawl budget.
        disallow: ["/projects/*/tasks/*", "/playbooks/*"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
