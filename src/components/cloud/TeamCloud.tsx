"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy, Crown, Link2, Plus, Trash2, UserCog } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { useConfirm, useToast } from "@/components/ToastProvider";
import { useStore } from "@/lib/store";
import { messageOf } from "@/lib/cloud-bridge";
import { inviteShareText } from "./invite-links";

const USER_COLORS = ["#ff5c1a", "#3b4ae4", "#16a34a", "#6b4ee4", "#dc2626", "#eab308", "#0a0a0a", "#c4f000"];

/** Team page for a cloud workspace: real accounts, invite links, roles. */
export default function TeamCloud() {
  const cloud = useStore((s) => s.cloud)!;
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const workspaceId = cloud.workspaceId as Id<"workspaces">;
  const members = useQuery(api.members.list, { workspaceId });
  // Ownership comes from the live member list, not the store: the store's
  // copy updates a render later, and an ownership transfer must not leave
  // this page subscribed to owner-only data it can no longer read.
  const myRole = members?.find((m) => m.id === cloud.account.userId)?.role;
  const isOwner = myRole === "owner";
  const invites = useQuery(api.members.listInvites, isOwner ? { workspaceId } : "skip");
  const invite = useMutation(api.members.invite);
  const revoke = useMutation(api.members.revokeInvite);
  const remove = useMutation(api.members.removeMember);
  const transfer = useMutation(api.members.transferOwnership);
  const toast = useToast();
  const confirm = useConfirm();
  const [profileOpen, setProfileOpen] = useState(false);

  const share = (token: string) => inviteShareText(token);
  const copiedMessage = (isLink: boolean) =>
    isLink ? "Invite link copied" : "Invite code copied — the recipient pastes it into “Join with an invite”";

  const copy = async (token: string) => {
    const { text, isLink } = share(token);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(copiedMessage(isLink));
    } catch {
      toast.error("Could not copy — select the invite below and copy it manually");
    }
  };

  /**
   * Create an invite and copy it in one click. WebKit (Safari, and the
   * macOS/iOS app's webview) only allows clipboard writes inside the click,
   * and the invite comes back after a network round trip — so hand the
   * clipboard a promise of the text, which it accepts within the gesture.
   */
  const createInvite = async () => {
    const created = invite({ workspaceId });
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const blob = created.then(({ token }) => new Blob([share(token).text], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
        const { token } = await created;
        toast.success(copiedMessage(share(token).isLink));
        return;
      }
      const { token } = await created;
      await copy(token);
    } catch (err) {
      // Either the invite failed (say why) or only the copy did (the
      // invite exists; it is listed below with its own Copy button).
      try {
        await created;
        toast.error("Invite created, but it could not be copied — use Copy below");
      } catch {
        toast.error(messageOf(err));
      }
    }
  };

  if (members === null) {
    return (
      <>
        <PageHeader kicker="Workspace" title="Team" />
        <div className="p-4 text-sm text-ink/60">You no longer have access to this workspace.</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title="Team"
        trailing={
          <>
            <Button variant="outline" iconLeft={<UserCog size={12} />} onClick={() => setProfileOpen(true)}>
              My profile
            </Button>
            {isOwner && (
              <Button variant="accent" iconLeft={<Plus size={12} />} onClick={() => void createInvite()}>
                Invite link
              </Button>
            )}
          </>
        }
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(members ?? []).map((m) => {
            const openCount = tasks.filter(
              (t) => t.assigneeId === m.id && t.status !== "done" && t.status !== "cancelled",
            ).length;
            const led = projects.filter((p) => p.leadId === m.id).length;
            const you = m.id === cloud.account.userId;
            return (
              <div key={m.id} className="border-[1.5px] border-ink bg-paper p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <Avatar user={m} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-bold truncate">{m.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                      @{m.handle} {m.title && `· ${m.title}`}
                    </div>
                  </div>
                  {m.role === "owner" && (
                    <span
                      className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest border-[1.5px] border-ink px-1 h-5"
                      title="Owner"
                    >
                      <Crown size={10} /> Owner
                    </span>
                  )}
                  {you && (
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest border-[1.5px] border-ink px-1 h-5 bg-accent">
                      <Check size={10} /> You
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="border-[1.5px] border-ink/20 p-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50">Open</div>
                    <div className="text-xl font-bold tabular-nums">{openCount}</div>
                  </div>
                  <div className="border-[1.5px] border-ink/20 p-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50">Leading</div>
                    <div className="text-xl font-bold tabular-nums">{led}</div>
                  </div>
                </div>
                {isOwner && !you && (
                  <div className="flex items-center gap-2">
                    {m.role !== "owner" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Transfer ownership",
                            message: `${m.name} becomes the owner of ${cloud.workspaceName}; you become a member, and the invite links you made stop working.`,
                            confirmLabel: "Transfer",
                            destructive: true,
                          });
                          if (!ok) return;
                          try {
                            await transfer({ workspaceId, toUserId: m.id as Id<"users"> });
                            toast.success(`${m.name} is now the owner`);
                          } catch (err) {
                            toast.error(messageOf(err));
                          }
                        }}
                      >
                        Make owner
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<Trash2 size={12} />}
                      disabled={m.role === "owner"}
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Remove member",
                          message: `${m.name} will lose access and be unassigned from ${openCount} open ${openCount === 1 ? "issue" : "issues"} and ${led} ${led === 1 ? "project" : "projects"}.`,
                          confirmLabel: "Remove member",
                          destructive: true,
                        });
                        if (!ok) return;
                        try {
                          await remove({ workspaceId, userId: m.id as Id<"users"> });
                          toast.success(`Removed ${m.name}`);
                        } catch (err) {
                          toast.error(messageOf(err));
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isOwner && (
          <section className="border-[1.5px] border-ink bg-paper">
            <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest font-bold">
              <span>Pending invites</span>
              <span className="text-ink/50 font-normal">links expire after 7 days · single use</span>
            </div>
            {!invites?.length ? (
              <div className="p-4 text-sm text-ink/60">
                No open invites. Create a link and send it to a teammate; whoever opens it while signed in joins.
              </div>
            ) : (
              <ul className="divide-y-[1.5px] divide-ink/10">
                {invites.map((i) => (
                  <li key={i.id} className="px-3 py-2 flex items-center gap-3">
                    <Link2 size={12} className="shrink-0 text-ink/50" />
                    <code className="font-mono text-[11px] truncate flex-1" title={share(i.token).text}>
                      {share(i.token).text}
                    </code>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink/50 hidden sm:block">
                      by {i.invitedBy} · {i.email ?? "anyone"} · until {i.expiresAt.slice(0, 10)}
                    </span>
                    <Button variant="outline" size="sm" iconLeft={<Copy size={12} />} onClick={() => void copy(i.token)}>
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await revoke({ inviteId: i.id });
                        } catch (err) {
                          toast.error(messageOf(err));
                        }
                      }}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}

function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useQuery(api.users.me, open ? {} : "skip");
  const update = useMutation(api.members.updateProfile);
  const toast = useToast();
  const [draft, setDraft] = useState<{ name: string; handle: string; title: string; color: string } | null>(null);
  const current = draft ?? (me ? { name: me.name, handle: me.handle, title: me.title ?? "", color: me.color } : null);

  const save = async () => {
    if (!current) return;
    try {
      await update({ name: current.name, handle: current.handle, title: current.title, color: current.color });
      toast.success("Profile updated");
      setDraft(null);
      onClose();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setDraft(null);
        onClose();
      }}
      title="My profile"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(null);
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button variant="accent" onClick={() => void save()} disabled={!current}>
            Save
          </Button>
        </>
      }
    >
      {!current ? (
        <p className="text-sm text-ink/60">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input value={current.name} onChange={(e) => setDraft({ ...current, name: e.target.value })} maxLength={80} />
          </div>
          <div>
            <Label>Handle</Label>
            <Input
              value={current.handle}
              onChange={(e) => setDraft({ ...current, handle: e.target.value })}
              placeholder="jane"
              maxLength={24}
            />
          </div>
          <div>
            <Label>Role</Label>
            <Input
              value={current.title}
              onChange={(e) => setDraft({ ...current, title: e.target.value })}
              placeholder="Engineer, Designer…"
              maxLength={60}
            />
          </div>
          <div>
            <Label>Color</Label>
            <div className="grid grid-cols-8 gap-2">
              {USER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setDraft({ ...current, color: c })}
                  className={`h-8 border-[1.5px] border-ink ${current.color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
