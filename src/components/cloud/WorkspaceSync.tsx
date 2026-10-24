"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { inviteTokenFromLocation } from "./invite-links";

/** How long sign-out may wait for the server before the device signs itself out. */
const SIGN_OUT_TIMEOUT_MS = 5_000;
/** The ConvexAuthProvider storage namespace (CloudTree.tsx), as the provider escapes it. */
const AUTH_NAMESPACE = "doodaboo";

/**
 * Keeps the store mirroring one cloud workspace for the signed-in account.
 *
 * The rule that keeps writes safe: whenever a valid workspace view is
 * present, the store holds a bridge for exactly that workspace, installed
 * before the view is ingested (the app renders only once `hydrated`). It is
 * derived from the current state on every pass, not from what changed, so
 * no navigation can leave the app rendered without a write path.
 *
 *   - no valid active workspace → the picker;
 *   - "Switch workspace" → the picker over an intact mirror; Back or the
 *     current workspace returns to it unchanged, another workspace clears
 *     the mirror and loads that one;
 *   - the active workspace disappears from the account's list (removed,
 *     deleted) → mirror cleared, a toast says why, back to the picker;
 *   - account changed or signed out → mirror cleared first, always.
 *
 * The active workspace id is remembered per account so two people sharing
 * a device never open each other's last workspace.
 */
export function WorkspaceSync({ children }: { children: ReactNode }) {
  const client = useConvex();
  const { signOut } = useAuthActions();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery(api.users.me, {});
  const mine = useQuery(api.workspace.listMine, {});
  const userId = me?.id ?? null;
  const email = me?.email ?? null;
  const hydrated = useStore((s) => s.hydrated);

  const [active, setActive] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pastedToken, setPastedToken] = useState<string | null>(null);
  const everValid = useRef<string | null>(null);

  // Account boundary: nothing from a previous account survives.
  useEffect(() => {
    clearCloudWorkspace();
    setPicking(false);
    setPastedToken(null);
    everValid.current = null;
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
      setPicking(false);
      if (id === active) return; // back to the workspace already mirrored
      clearCloudWorkspace();
      writeActive(userId, id);
      setActive(id);
    },
    [userId, active],
  );

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    // The provider clears its tokens only after the server acknowledges,
    // and offline that never comes. Sign the device out regardless.
    const done = await Promise.race([
      signOut().then(() => true, () => false),
      new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), SIGN_OUT_TIMEOUT_MS)),
    ]);
    clearCloudWorkspace();
    if (!done) {
      forgetLocalSession();
      window.location.replace(routes.home);
    }
  }, [signOut]);

  // Bridge + mirror, derived from the current state (see the rule above).
  useEffect(() => {
    if (!valid || !userId || view === undefined) return;
    if (view === null) return; // handled with revocation below
    const current = useStore.getState().cloud;
    if (
      !current ||
      current.workspaceId !== view.id ||
      current.role !== view.role ||
      current.workspaceName !== view.name ||
      current.account.email !== email
    ) {
      useStore.setState({
        cloud: createCloudBridge({
          client,
          workspaceId: view.id as Id<"workspaces">,
          workspaceName: view.name,
          role: view.role,
          account: { email, userId },
          notify: (message) => toast.error(message),
          switchWorkspace: () => setPicking(true),
          signOut: handleSignOut,
        }),
      });
    }
    ingestCloudView(view);
    everValid.current = view.id;
  }, [client, valid, view, userId, email, toast, handleSignOut, hydrated]);

  // Revocation: the active workspace is gone from the account's list (or
  // the server says no access). Toast only if it was open in this session;
  // a stale remembered id from a past session clears silently.
  useEffect(() => {
    if (!userId || !active || mine === undefined) return;
    const listed = mine.some((w) => w.id === active);
    if (listed && view !== null) return;
    clearActive(userId);
    const lost = everValid.current === active;
    everValid.current = null;
    clearCloudWorkspace();
    setActive(null);
    if (lost) toast.error("You no longer have access to that workspace");
  }, [userId, active, mine, view, toast]);

  const leaveJoin = useCallback(
    (id: string | null) => {
      setPastedToken(null);
      if (id) {
        if (userId) writeActive(userId, id);
        pick(id);
      }
      // A real navigation (not history.replaceState): the /join page must
      // unmount, and the token must leave the address bar and history.
      if (pathname === routes.join) router.replace(routes.home);
    },
    [pick, pathname, router, userId],
  );

  if (signingOut) {
    return (
      <CloudFrame title="Signing out">
        <p className="text-sm text-ink/70">Signing you out…</p>
      </CloudFrame>
    );
  }

  // Invite links are redeemed before anything else is decided.
  const token = pastedToken ?? (pathname === routes.join ? inviteTokenFromLocation() : null);
  if (token && userId) {
    return <JoinInvite token={token} onDone={leaveJoin} onSignOut={handleSignOut} />;
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
        onRedeem={setPastedToken}
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
        <button type="button" className="underline text-xs text-ink/60" onClick={() => setPicking(true)}>
          Choose another workspace
        </button>
      </CloudFrame>
    );
  }
  return (
    <>
      {children}
      {view.truncated.length > 0 && <TruncatedNotice collections={view.truncated} />}
    </>
  );
}

/** Drop this device's sign-in tokens (used when the server cannot be told). */
function forgetLocalSession(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("__convexAuth") && key.endsWith(`_${AUTH_NAMESPACE}`)) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing persisted to forget.
  }
}

const COLLECTION_NAMES: Record<string, string> = {
  labels: "labels",
  projects: "projects",
  tasks: "issues",
  posts: "posts",
};

/**
 * The server returned only part of the workspace because it has outgrown
 * what one read can carry (convex/lib.ts loadViewBudgeted). Say which parts
 * and what helps, and keep it visible: exports and counts are partial too.
 */
function TruncatedNotice({ collections }: { collections: string[] }) {
  const names = collections.map((c) => COLLECTION_NAMES[c] ?? c).join(" and ");
  return (
    <div
      role="status"
      data-testid="truncated-notice"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[calc(100%-1.5rem)] border-[1.5px] border-ink bg-accent text-ink px-3 py-2 text-xs shadow-brutal-sm"
    >
      <span className="font-mono uppercase tracking-wider text-[10px] font-bold">Workspace too large to load in full · </span>
      Only the newest {names} are shown, and exports include only what is shown. Archive or delete old {names}, or split
      the workspace, to bring the rest back.
    </div>
  );
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

