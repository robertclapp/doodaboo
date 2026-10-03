"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { isCloudBuild } from "@/lib/backend";
import { routes } from "@/lib/routes";

/**
 * Invite links land here. In cloud mode the cloud runtime intercepts this
 * path before the app shell renders (src/components/cloud/WorkspaceSync.tsx)
 * and redeems the token; this page body is what a local-first build shows.
 */
export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinBody />
    </Suspense>
  );
}

function JoinBody() {
  const token = useSearchParams().get("token");
  return (
    <>
      <PageHeader kicker="Workspace" title="Invitation" />
      <div className="p-4 max-w-xl space-y-3 text-sm">
        {isCloudBuild() ? (
          <p className="text-ink/70">
            This device is set to work locally. Switch back to the cloud in Settings → Cloud to redeem the
            invite.
          </p>
        ) : (
          <p className="text-ink/70">
            Invite links join a shared cloud workspace, and this build runs local-first on this device
            only. Open the link in the cloud edition of Doodaboo to join.
          </p>
        )}
        {token && (
          <p className="font-mono text-[11px] text-ink/50 break-all">token: {token}</p>
        )}
        <Link href={routes.home} className="underline">
          Back to the dashboard
        </Link>
      </div>
    </>
  );
}
