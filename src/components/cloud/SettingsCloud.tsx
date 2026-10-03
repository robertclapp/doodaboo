"use client";

import { useRef } from "react";
import { useMutation } from "convex/react";
import { HardDrive, LogOut, Trash2, Upload } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { useConfirm, useToast } from "@/components/ToastProvider";
import { useStore, type ExportPayload } from "@/lib/store";
import { messageOf } from "@/lib/cloud-bridge";
import { cloud as cloudConfig, setLocalOverride } from "@/lib/backend";
import { ConnectionBanner } from "./ConnectionBanner";

/** Settings sections for a cloud workspace. Rendered in place of Import + Danger zone. */
export default function SettingsCloud() {
  const cloud = useStore((s) => s.cloud)!;
  const workspaceId = cloud.workspaceId as Id<"workspaces">;
  const isOwner = cloud.role === "owner";
  const leave = useMutation(api.members.leave);
  const destroy = useMutation(api.workspace.deleteWorkspace);
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as ExportPayload;
      if (
        !payload ||
        typeof payload.version !== "number" ||
        !Array.isArray(payload.labels) ||
        !Array.isArray(payload.projects) ||
        !Array.isArray(payload.tasks)
      ) {
        throw new Error("File does not look like a doodaboo export.");
      }
      const ok = await confirm({
        title: "Replace workspace content",
        message: `Every label, project, issue and post in ${cloud.workspaceName} will be replaced for all members. Deleted records cannot be restored.`,
        confirmLabel: "Replace everything",
        destructive: true,
      });
      if (!ok) return;
      await cloud.replaceContent(payload);
      toast.success("Workspace content replaced");
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  const handleLeave = async () => {
    const ok = await confirm({
      title: "Leave workspace",
      message: `You will lose access to ${cloud.workspaceName} until someone invites you again.`,
      confirmLabel: "Leave",
      destructive: true,
    });
    if (!ok) return;
    try {
      await leave({ workspaceId });
      cloud.switchWorkspace();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete workspace",
      message: `${cloud.workspaceName} and everything in it will be deleted for every member. This cannot be undone.`,
      confirmLabel: "Delete workspace",
      destructive: true,
    });
    if (!ok) return;
    try {
      await destroy({ workspaceId });
      cloud.switchWorkspace();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  const workLocally = async () => {
    const ok = await confirm({
      title: "Work locally on this device",
      message:
        "This device will use its own local workspace instead of the cloud until you switch back here. Nothing in the cloud workspace is changed.",
      confirmLabel: "Use local workspace",
    });
    if (!ok) return;
    setLocalOverride(true);
    window.location.href = "/";
  };

  return (
    <>
      <section className="col-span-12 lg:col-span-6 border-[1.5px] border-ink bg-paper">
        <Header>Cloud</Header>
        <div className="p-4 space-y-3 text-sm">
          <Row label="Deployment" value={cloudConfig.url ?? "—"} mono />
          <Row label="Workspace" value={cloud.workspaceName} />
          <Row label="Your role" value={cloud.role} mono />
          <Row label="Account" value={cloud.account.email ?? "—"} />
          <ConnectionBanner compact />
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button variant="outline" size="sm" onClick={cloud.switchWorkspace}>
              Switch workspace
            </Button>
            <Button variant="outline" size="sm" iconLeft={<LogOut size={12} />} onClick={() => void cloud.signOut()}>
              Sign out
            </Button>
            <Button variant="ghost" size="sm" iconLeft={<HardDrive size={12} />} onClick={() => void workLocally()}>
              Work locally on this device
            </Button>
          </div>
        </div>
      </section>

      <section className="col-span-12 border-[1.5px] border-ink bg-paper">
        <Header>Danger zone</Header>
        {isOwner && (
          <div className="p-4 flex items-center justify-between gap-4 flex-wrap border-b-[1.5px] border-ink/10">
            <div>
              <div className="text-sm font-semibold">Replace content from a JSON export</div>
              <div className="text-xs text-ink/60">
                Owner only. Replaces every label, project, issue and post for all members.
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImport(f);
                e.target.value = "";
              }}
            />
            <Button variant="danger" iconLeft={<Upload size={12} />} onClick={() => fileRef.current?.click()}>
              Choose JSON file
            </Button>
          </div>
        )}
        <div className="p-4 flex items-center justify-between gap-4 flex-wrap border-b-[1.5px] border-ink/10">
          <div>
            <div className="text-sm font-semibold">Leave workspace</div>
            <div className="text-xs text-ink/60">
              {isOwner ? "Transfer ownership on the Team page first." : "You can be invited back later."}
            </div>
          </div>
          <Button variant="danger" iconLeft={<LogOut size={12} />} onClick={() => void handleLeave()}>
            Leave
          </Button>
        </div>
        {isOwner && (
          <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Delete workspace</div>
              <div className="text-xs text-ink/60">Removes it for every member. No undo.</div>
            </div>
            <Button variant="danger" iconLeft={<Trash2 size={12} />} onClick={() => void handleDelete()}>
              Delete workspace
            </Button>
          </div>
        )}
      </section>
    </>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">{label}</span>
      <span className={`truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
