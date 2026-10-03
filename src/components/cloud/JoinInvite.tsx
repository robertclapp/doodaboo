"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { messageOf } from "@/lib/cloud-bridge";
import { routes } from "@/lib/routes";
import { CloudFrame } from "./CloudFrame";

/** Redeems an invite link for the signed-in account. */
export function JoinInvite({
  token,
  onJoined,
  onSignOut,
}: {
  token: string;
  onJoined: (workspaceId: string) => void;
  onSignOut: () => Promise<void>;
}) {
  const invite = useQuery(api.members.peekInvite, { token });
  const accept = useMutation(api.members.acceptInvite);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = (await accept({ token })) as string;
      window.history.replaceState(null, "", routes.home);
      onJoined(id);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    window.location.href = routes.home;
  };

  return (
    <CloudFrame
      title="Invitation"
      footer={
        <button
          type="button"
          className="font-mono text-[10px] uppercase tracking-widest text-ink/60 hover:text-ink underline"
          onClick={() => void onSignOut()}
        >
          Not you? Sign out
        </button>
      }
    >
      {invite === undefined ? (
        <p className="text-sm text-ink/70">Checking the invite…</p>
      ) : invite === null ? (
        <>
          <p className="text-sm">This invite link is no longer valid — it may have been used or expired.</p>
          <Button variant="outline" onClick={leave}>
            Go to my workspaces
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm">
            You have been invited to join <span className="font-semibold">{invite.name}</span>.
          </p>
          {error && (
            <div role="alert" className="border-[1.5px] border-ink bg-priority-urgent text-paper px-3 py-2 text-xs">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="accent" onClick={() => void join()} disabled={busy}>
              {busy ? "Joining…" : "Join workspace"}
            </Button>
            <Button variant="ghost" onClick={leave}>
              Not now
            </Button>
          </div>
        </>
      )}
    </CloudFrame>
  );
}
