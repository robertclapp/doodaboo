"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { isCloudBuild, localOverride, setLocalOverride } from "@/lib/backend";
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
  // Read on the client only: the device override lives in localStorage.
  const [overridden, setOverridden] = useState(false);
  useEffect(() => setOverridden(localOverride()), []);
  return (
    <>
      <PageHeader kicker="Workspace" title="Invitation" />
      <div className="p-4 max-w-xl space-y-3 text-sm">
        {isCloudBuild() && overridden ? (
          <>
            <p className="text-ink/70">
              This device is set to work locally, so it cannot open the invite. Switch back to the cloud to
              redeem it.
            </p>
            <Button
              variant="accent"
              onClick={() => {
                setLocalOverride(false);
                // Same URL, so the invite (in the #fragment) survives the reload.
                window.location.replace(window.location.href);
              }}
            >
              Use the cloud and open the invite
            </Button>
          </>
        ) : (
          <p className="text-ink/70">
            Invite links join a shared cloud workspace, and this build runs local-first on this device only. Open
            the link in the cloud edition of Doodaboo to join.
          </p>
        )}
        <div>
          <Link href={routes.home} className="underline">
            Back to the dashboard
          </Link>
        </div>
      </div>
    </>
  );
}
