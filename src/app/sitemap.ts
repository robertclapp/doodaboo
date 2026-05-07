import { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://doodaboo.example.com";

// Static surfaces only. Per-project, per-task, and per-post pages live in
// localStorage so they aren't crawlable resources.
const ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/projects", changeFrequency: "weekly", priority: 0.8 },
  { path: "/projects/new", changeFrequency: "monthly", priority: 0.5 },
  { path: "/my-issues", changeFrequency: "weekly", priority: 0.6 },
  { path: "/inbox", changeFrequency: "weekly", priority: 0.6 },
  { path: "/team", changeFrequency: "weekly", priority: 0.5 },
  { path: "/labels", changeFrequency: "weekly", priority: 0.4 },
  { path: "/posts", changeFrequency: "weekly", priority: 0.9 },
  { path: "/posts/new", changeFrequency: "monthly", priority: 0.6 },
  { path: "/posts/insights", changeFrequency: "weekly", priority: 0.7 },
  { path: "/posts/compare", changeFrequency: "weekly", priority: 0.6 },
  { path: "/playbooks", changeFrequency: "monthly", priority: 0.7 },
  { path: "/settings", changeFrequency: "monthly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
