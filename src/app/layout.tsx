import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { StoreHydration } from "@/components/StoreHydration";
import { ThemeManager } from "@/components/ThemeManager";

export const metadata: Metadata = {
  title: "DOODABOO — Project OS",
  description:
    "Brutalist project management. Projects, issues, status, priority, assignees.",
};

// Read the persisted theme preference and set the data-theme attribute
// before React mounts so dark-mode users don't see a light-mode flash.
const themeBootstrap = `(function(){try{var raw=localStorage.getItem('doodaboo-v1');var t='system';if(raw){var p=JSON.parse(raw).state;if(p&&p.theme)t=p.theme;}var resolved=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.theme=resolved;}catch(e){}})();`;

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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
