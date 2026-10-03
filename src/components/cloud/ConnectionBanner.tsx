"use client";

import { useEffect, useState } from "react";
import { useConvexConnectionState } from "convex/react";
import { cloudHost, setLocalOverride } from "@/lib/backend";
// The decision itself is pure and unit-tested: src/lib/connection-status.ts.
import { connectionStatus } from "@/lib/connection-status";

/**
 * Tells the truth about the socket. Convex queues mutations in memory while
 * disconnected and sends them on reconnect, but a reload drops that queue —
 * so pending writes are shown, and a deployment that never answers offers
 * the way out: run this device locally.
 */
export function ConnectionBanner({ compact }: { compact?: boolean }) {
  const state = useConvexConnectionState();
  const [mountedAt] = useState(() => Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 2000);
    return () => window.clearInterval(id);
  }, []);
  const status = connectionStatus(
    {
      isWebSocketConnected: state.isWebSocketConnected,
      hasEverConnected: state.hasEverConnected,
      connectionRetries: state.connectionRetries,
      inflightMutations: state.inflightMutations,
    },
    Date.now() - mountedAt,
  );
  if (status.kind === "ok") return null;

  const goLocal = () => {
    setLocalOverride(true);
    window.location.href = "/";
  };

  if (status.kind === "pending") {
    return (
      <div
        role="status"
        className={`border-[1.5px] border-ink bg-accent text-ink font-mono text-[10px] uppercase tracking-wider ${compact ? "px-2 py-1" : "px-3 py-2"}`}
      >
        {status.count} change{status.count === 1 ? "" : "s"} waiting to sync — keep this window open
      </div>
    );
  }

  return (
    <div
      role="alert"
      data-testid="connection-banner"
      className={`border-[1.5px] border-ink bg-priority-urgent text-paper ${compact ? "px-2 py-1" : "px-3 py-2"} space-y-1`}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider">
        Can&apos;t reach {cloudHost()}
        {status.retries > 0 ? ` (retry ${status.retries})` : ""}
      </div>
      {!compact && (
        <div className="text-xs">
          Edits are kept in memory until the connection returns; a reload loses them.{" "}
          <button type="button" onClick={goLocal} className="underline font-semibold">
            Work locally on this device instead
          </button>
          .
        </div>
      )}
    </div>
  );
}
