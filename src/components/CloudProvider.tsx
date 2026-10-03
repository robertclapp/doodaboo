"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { isCloudBuild } from "@/lib/backend";

// The whole cloud runtime — Convex client, auth provider, sign-in, workspace
// sync — lives in one lazily loaded chunk that only a cloud build requests.
// A local-first build renders children directly and never downloads it;
// `isCloudBuild()` is a build-time constant, so the branch below is folded.
const CloudTree = dynamic(() => import("./cloud/CloudTree"), {
  ssr: false,
  loading: () => null,
});

export function CloudProvider({ children }: { children: ReactNode }) {
  if (!isCloudBuild()) return <>{children}</>;
  return <CloudTree>{children}</CloudTree>;
}
