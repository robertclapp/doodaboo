"use client";

import { useState, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { cloud, localOverride } from "@/lib/backend";
import { CloudGate } from "./CloudGate";

/**
 * Root of the cloud runtime. One client per page (a new client per render
 * would reconnect and re-authenticate on every re-render); token storage is
 * localStorage under a fixed namespace, which also works inside the Tauri
 * webview.
 *
 * The device-level override (`doodaboo-mode=local`) is honored here, after
 * mount, so a cloud build can still run as a local-first app on a device
 * that cannot reach the deployment.
 */
let client: ConvexReactClient | null = null;
function getClient(): ConvexReactClient {
  if (!client) {
    client = new ConvexReactClient(cloud.url!, {
      // Warn before the tab closes while mutations are still queued
      // (the client holds them in memory until the socket is back).
      unsavedChangesWarning: true,
    });
  }
  return client;
}

export default function CloudTree({ children }: { children: ReactNode }) {
  const [local] = useState(() => localOverride());
  if (local) return <>{children}</>;
  return (
    <ConvexAuthProvider client={getClient()} storageNamespace="doodaboo">
      <CloudGate>{children}</CloudGate>
    </ConvexAuthProvider>
  );
}
