"use client";

import type { ReactNode } from "react";
import { useConvexAuth } from "convex/react";
import { SignIn } from "./SignIn";
import { WorkspaceSync } from "./WorkspaceSync";
import { CloudFrame } from "./CloudFrame";
import { ConnectionBanner } from "./ConnectionBanner";

/**
 * Nothing workspace-shaped renders until the caller is signed in and a
 * workspace is mirrored: the sidebar never shows another account's data,
 * and the seed never flashes under a cloud URL.
 */
export function CloudGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <CloudFrame title="Connecting">
        <p className="text-sm text-ink/70">Checking your session…</p>
        <ConnectionBanner />
      </CloudFrame>
    );
  }
  if (!isAuthenticated) return <SignIn />;
  return <WorkspaceSync>{children}</WorkspaceSync>;
}
