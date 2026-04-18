import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { StoreHydration } from "@/components/StoreHydration";

export const metadata: Metadata = {
  title: "DOODABOO — Project OS",
  description:
    "Brutalist project management. Projects, issues, status, priority, assignees.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased">
        <StoreHydration />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
