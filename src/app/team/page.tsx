"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { Avatar } from "@/components/ui/Avatar";
import { Check, Plus, Trash2 } from "lucide-react";
import { useConfirm, useToast } from "@/components/ToastProvider";

const USER_COLORS = [
  "#ff5c1a",
  "#3b4ae4",
  "#16a34a",
  "#6b4ee4",
  "#dc2626",
  "#eab308",
  "#0a0a0a",
  "#c4f000",
];

export default function TeamPage() {
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const addUser = useStore((s) => s.addUser);
  const removeUser = useStore((s) => s.removeUser);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const hydrated = useStore((s) => s.hydrated);
  const confirm = useConfirm();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState("");
  const [color, setColor] = useState(USER_COLORS[0]);

  if (!hydrated) return null;

  const submit = () => {
    if (!name.trim() || !handle.trim()) return;
    addUser({
      name: name.trim(),
      handle: handle.trim().replace(/^@/, ""),
      role: role.trim() || undefined,
      color,
    });
    setOpen(false);
    setName("");
    setHandle("");
    setRole("");
    setColor(USER_COLORS[0]);
  };

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title="Team"
        trailing={
          <Button
            variant="accent"
            iconLeft={<Plus size={12} />}
            onClick={() => setOpen(true)}
          >
            Invite Member
          </Button>
        }
      />
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {users.map((u) => {
          const openCount = tasks.filter(
            (t) =>
              t.assigneeId === u.id &&
              t.status !== "done" &&
              t.status !== "cancelled",
          ).length;
          const led = projects.filter((p) => p.leadId === u.id).length;
          return (
            <div
              key={u.id}
              className="border-[1.5px] border-ink bg-paper p-4 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <Avatar user={u} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold truncate">{u.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                    @{u.handle} {u.role && `· ${u.role}`}
                  </div>
                </div>
                {u.id === currentUserId && (
                  <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest border-[1.5px] border-ink px-1 h-5 bg-accent">
                    <Check size={10} /> You
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="border-[1.5px] border-ink/20 p-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50">
                    Open
                  </div>
                  <div className="text-xl font-bold tabular-nums">{openCount}</div>
                </div>
                <div className="border-[1.5px] border-ink/20 p-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50">
                    Leading
                  </div>
                  <div className="text-xl font-bold tabular-nums">{led}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {u.id !== currentUserId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentUser(u.id)}
                  >
                    Act as
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" disabled>
                    Active user
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<Trash2 size={12} />}
                  onClick={async () => {
                    if (u.id === currentUserId) return;
                    const ok = await confirm({
                      title: "Remove member",
                      message: `${u.name} will be unassigned from ${openCount} open ${openCount === 1 ? "issue" : "issues"} and ${led} ${led === 1 ? "project" : "projects"}.`,
                      confirmLabel: "Remove member",
                      destructive: true,
                    });
                    if (ok) {
                      removeUser(u.id);
                      toast.success(`Removed ${u.name}`);
                    }
                  }}
                  disabled={u.id === currentUserId}
                >
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invite Member"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" onClick={submit}>
              Add Member
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Handle</Label>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="jane"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Engineer, Designer…"
            />
          </div>
          <div>
            <Label>Color</Label>
            <div className="grid grid-cols-8 gap-2">
              {USER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 border-[1.5px] border-ink ${color === c ? "shadow-brutal-sm -translate-x-[1px] -translate-y-[1px]" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
