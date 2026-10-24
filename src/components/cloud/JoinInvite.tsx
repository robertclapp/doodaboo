"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { messageOf } from "@/lib/cloud-bridge";
import { CloudFrame } from "./CloudFrame";

/**
 * Redeems an invite for the signed-in account. Whatever the outcome —
 * joined, already a member, declined, invalid — `onDone` navigates away for
 * real, which also takes the token out of the address bar and history.
 */
export function JoinInvite({
  token,
  onDone,
  onSignOut,
}: {
  token: string;
  /** The workspace to open, or null to just leave the invite screen. */
  onDone: (workspaceId: string | null) => void;
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
      onDone(id);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
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
          <p className="text-sm">
            This invite is no longer valid — it may have been used, revoked, or expired. Ask for a new one.
          </p>
          <Button variant="outline" onClick={() => onDone(null)}>
            Go to my workspaces
          </Button>
        </>
      ) : invite.alreadyMember ? (
        <>
          <p className="text-sm">
            You are already in <span className="font-semibold">{invite.name}</span>. The invite stays unused, so it
            still works for the person it was meant for.
          </p>
          <Button variant="accent" onClick={() => onDone(invite.workspaceId)}>
            Open {invite.name}
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
            <Button variant="ghost" onClick={() => onDone(null)}>
              Not now
            </Button>
          </div>
        </>
      )}
    </CloudFrame>
  );
}
