"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useConvex, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { clearCloudWorkspace, ingestCloudView, useStore, type CloudView } from "@/lib/store";
import { createCloudBridge } from "@/lib/cloud-bridge";
import { routes } from "@/lib/routes";
import { useToast } from "@/components/ToastProvider";
import { CloudFrame } from "./CloudFrame";
import { ConnectionBanner } from "./ConnectionBanner";
import { WorkspacePicker } from "./WorkspacePicker";
import { JoinInvite } from "./JoinInvite";

/**
 * Keeps the store mirroring one cloud workspace for the signed-in account.
 *
 * State machine (per account):
 *   - no valid active workspace → the picker;
 *   - active workspace, query pending → loading;
 *   - result arrived → `ingestCloudView` flips `hydrated`, the app renders;
 *   - result became null (membership revoked, workspace deleted) → mirror
 *     cleared, back to the picker;
 *   - account changed or signed out → mirror cleared first, always.
 *
 * The active workspace id is remembered per account so two people sharing
 * a device never open each other's last workspace.
 */
export function WorkspaceSync({ children }: { children: ReactNode }) {
  const client = useConvex();
  const { signOut } = useAuthActions();
  const toast = useToast();
  const pathname = usePathname();
  const me = useQuery(api.users.me, {});
  const mine = useQuery(api.workspace.listMine, {});
  const userId = me?.id ?? null;
  const hydrated = useStore((s) => s.hydrated);

  const [active, setActive] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // Account boundary: nothing from a previous account survives.
  useEffect(() => {
    clearCloudWorkspace();
    setPicking(false);
    setActive(userId ? readActive(userId) : null);
  }, [userId]);

  const valid = !!userId && !!active && !!mine?.some((w) => w.id === active);
  const view = useQuery(api.workspace.get, valid ? { workspaceId: active as Id<"workspaces"> } : "skip") as
    | CloudView
    | null
    | undefined;

  const pick = useCallback(
    (id: string) => {
      if (!userId) return;
      clearCloudWorkspace();
      writeActive(userId, id);
      setActive(id);
      setPicking(false);
    },
    [userId],
  );

  const handleSignOut = useCallback(async () => {
    clearCloudWorkspace();
    await signOut();
  }, [signOut]);

  // The bridge is the store's write path; rebuilt only when its identity
  // inputs change, not on every reactive result.
  const viewId = view?.id ?? null;
  const viewRole = view?.role ?? null;
  const viewName = view?.name ?? null;
  const email = me?.email ?? null;
  useEffect(() => {
    if (!valid || !viewId || !viewRole || !viewName || !userId) return;
    useStore.setState({
      cloud: createCloudBridge({
        client,
        workspaceId: viewId as Id<"workspaces">,
        workspaceName: viewName,
        role: viewRole,
        account: { email, userId },
        notify: (message) => toast.error(message),
        switchWorkspace: () => {
          clearCloudWorkspace();
          setPicking(true);
        },
        signOut: handleSignOut,
      }),
    });
  }, [client, valid, viewId, viewRole, viewName, userId, email, toast, handleSignOut]);

  // Mirror every result; a null result means access is gone.
  useEffect(() => {
    if (!valid) return;
    if (view === null) {
      if (userId) clearActive(userId);
      clearCloudWorkspace();
      setActive(null);
      toast.error("You no longer have access to that workspace");
      return;
    }
    if (view) ingestCloudView(view);
  }, [valid, view, userId, toast]);

  // Invite links are redeemed before anything else is decided.
  const token = pathname === routes.join ? currentToken() : null;
  if (token && userId) {
    return <JoinInvite token={token} onJoined={pick} onSignOut={handleSignOut} />;
  }

  if (me === undefined || mine === undefined) {
    return (
      <CloudFrame title="Loading">
        <p className="text-sm text-ink/70">Fetching your workspaces…</p>
        <ConnectionBanner />
      </CloudFrame>
    );
  }
  if (!userId) {
    return (
      <CloudFrame title="Account">
        <p className="text-sm text-ink/70">Your account could not be loaded.</p>
        <button type="button" className="underline text-sm" onClick={() => void handleSignOut()}>
          Sign out
        </button>
      </CloudFrame>
    );
  }
  if (!valid || picking) {
    return (
      <WorkspacePicker
        account={{ userId, email, name: me?.name ?? "" }}
        workspaces={mine}
        current={valid ? active : null}
        onPick={pick}
        onSignOut={handleSignOut}
        onCancel={valid ? () => setPicking(false) : undefined}
      />
    );
  }
  if (!view || !hydrated) {
    return (
      <CloudFrame title="Loading workspace">
        <p className="text-sm text-ink/70">Syncing…</p>
        <ConnectionBanner />
      </CloudFrame>
    );
  }
  return <>{children}</>;
}

const activeKey = (userId: string) => `doodaboo-cloud:${userId}:workspace`;

function readActive(userId: string): string | null {
  try {
    return window.localStorage.getItem(activeKey(userId));
  } catch {
    return null;
  }
}
function writeActive(userId: string, id: string): void {
  try {
    window.localStorage.setItem(activeKey(userId), id);
  } catch {
    // Storage unavailable; the picker will show again next time.
  }
}
function clearActive(userId: string): void {
  try {
    window.localStorage.removeItem(activeKey(userId));
  } catch {
    // Nothing to clear.
  }
}

function currentToken(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("token");
}
