import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { CloudProvider } from "@/components/CloudProvider";
import { StoreHydration } from "@/components/StoreHydration";
import { ThemeManager } from "@/components/ThemeManager";
import { ToastProvider } from "@/components/ToastProvider";
import { CLOUD_PREFS_KEY, isCloudBuild, MODE_KEY } from "@/lib/backend";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://doodaboo.example.com";
const SITE_NAME = "Doodaboo — Project OS";
const SITE_DESCRIPTION =
  "Brutalist project OS. Projects, issues, kanban, plus a multi-platform virality predictor with playbooks, insights, and side-by-side variant compare.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: "%s · Doodaboo",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "project management",
    "linear clone",
    "social media analytics",
    "virality predictor",
    "growth playbooks",
    "kanban",
    "brutalist UI",
  ],
  authors: [{ name: "Robert Clapp" }],
  creator: "Robert Clapp",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png" }],
  },
  openGraph: {
    type: "website",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0e" },
  ],
};

// Read the persisted theme preference and set the data-theme attribute
// before React mounts so dark-mode users don't see a light-mode flash.
// Local mode keeps the theme inside the workspace record (`doodaboo-v1`);
// cloud mode keeps only preferences, under their own key — unless the
// device overrides a cloud build back to local (src/lib/backend.ts).
const themeBootstrap = `(function(){try{var cloud=${isCloudBuild() ? "true" : "false"}&&localStorage.getItem(${JSON.stringify(MODE_KEY)})!=='local';var raw=localStorage.getItem(cloud?${JSON.stringify(CLOUD_PREFS_KEY)}:'doodaboo-v1');var t='system';if(raw){var p=JSON.parse(raw).state;if(p&&p.theme)t=p.theme;}var resolved=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.theme=resolved;}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <StoreHydration />
        <ThemeManager />
        <ToastProvider>
          <CloudProvider>
            <AppShell>{children}</AppShell>
          </CloudProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
