"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { messageOf } from "@/lib/cloud-bridge";
import { hasContent, readLocalWorkspace } from "@/lib/local-vault";
import { normalizeContent } from "@/lib/normalize-content";
import { parseInviteInput } from "./invite-links";
import type { WorkspaceState } from "@/lib/mutations";
import { CloudFrame } from "./CloudFrame";
import { ConnectionBanner } from "./ConnectionBanner";

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: "owner" | "member";
}

export function WorkspacePicker({
  account,
  workspaces,
  current,
  onPick,
  onRedeem,
  onSignOut,
  onCancel,
}: {
  account: { userId: string; email: string | null; name: string };
  workspaces: WorkspaceSummary[];
  current: string | null;
  onPick: (id: string) => void;
  /** Open the invite screen for a pasted link or code. */
  onRedeem: (token: string) => void;
  onSignOut: () => Promise<void>;
  onCancel?: () => void;
}) {
  const create = useMutation(api.workspace.create);
  const [name, setName] = useState("");
  const [local, setLocal] = useState<WorkspaceState | null>(null);
  const [upload, setUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteText, setInviteText] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    void readLocalWorkspace().then((ws) => setLocal(hasContent(ws) ? ws : null));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = name.trim();
    if (!clean) return setError("Give the workspace a name");
    setBusy(true);
    try {
      const id = (await create({
        name: clean,
        ...(upload && local
          ? {
              // The vault may carry stray fields from API edits; send only what the cloud accepts.
              content: normalizeContent(local),
              fromUserId: local.currentUserId || undefined,
            }
          : {}),
      })) as string;
      onPick(id);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const localSummary = local
    ? `${local.projects.length} project${local.projects.length === 1 ? "" : "s"}, ${local.tasks.length} issue${local.tasks.length === 1 ? "" : "s"}, ${local.posts.length} post${local.posts.length === 1 ? "" : "s"}`
    : "";

  return (
    <CloudFrame
      title="Workspaces"
      wide
      footer={
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-ink/60">
          <span className="truncate">{account.email ?? account.name}</span>
          <div className="flex items-center gap-3">
            {onCancel && (
              <button type="button" className="underline hover:text-ink" onClick={onCancel}>
                Back
              </button>
            )}
            <button type="button" className="underline hover:text-ink" onClick={() => void onSignOut()}>
              Sign out
            </button>
          </div>
        </div>
      }
    >
      {workspaces.length > 0 ? (
        <ul className="divide-y-[1.5px] divide-ink/10 border-[1.5px] border-ink" aria-label="Your workspaces">
          {workspaces.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{w.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">{w.role}</div>
              </div>
              <Button variant={w.id === current ? "ghost" : "accent"} size="sm" onClick={() => onPick(w.id)}>
                {w.id === current ? "Current" : "Open"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink/70">
          You are not in any workspace yet. Create one, or open an invite link a teammate sent you.
        </p>
      )}

      <form
        className="space-y-2 border-t-[1.5px] border-ink/10 pt-4"
        aria-label="Join with an invite"
        onSubmit={(e) => {
          e.preventDefault();
          const token = parseInviteInput(inviteText);
          if (!token) return setInviteError("That does not look like an invite link or code");
          setInviteError(null);
          onRedeem(token);
        }}
      >
        <Label htmlFor="invite-text">Join with an invite</Label>
        <div className="flex items-center gap-2">
          <Input
            id="invite-text"
            value={inviteText}
            onChange={(e) => setInviteText(e.target.value)}
            placeholder="Paste the invite link or code"
          />
          <Button type="submit" variant="outline">
            Continue
          </Button>
        </div>
        {inviteError && (
          <div role="alert" className="text-xs text-priority-urgent">
            {inviteError}
          </div>
        )}
      </form>

      <form onSubmit={submit} className="space-y-3 border-t-[1.5px] border-ink/10 pt-4" aria-label="Create workspace">
        <div>
          <Label htmlFor="ws-name">New workspace</Label>
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Studio"
            maxLength={80}
          />
        </div>
        {local && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={upload} onChange={(e) => setUpload(e.target.checked)} className="mt-1" />
            <span>
              Upload this device&apos;s local workspace into it
              <span className="block font-mono text-[10px] uppercase tracking-wider text-ink/50">{localSummary}</span>
            </span>
          </label>
        )}
        {error && (
          <div role="alert" className="border-[1.5px] border-ink bg-priority-urgent text-paper px-3 py-2 text-xs">
            {error}
          </div>
        )}
        <Button type="submit" variant="accent" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </Button>
      </form>
      <ConnectionBanner />
    </CloudFrame>
  );
}
