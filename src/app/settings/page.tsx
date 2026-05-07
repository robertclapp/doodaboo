"use client";

import { useRef } from "react";
import {
  Download,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { Theme } from "@/lib/store";
import { useConfirm, useToast } from "@/components/ToastProvider";

export default function SettingsPage() {
  const hydrated = useStore((s) => s.hydrated);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const resetToSeed = useStore((s) => s.resetToSeed);
  const exportState = useStore((s) => s.exportState);
  const importState = useStore((s) => s.importState);

  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const users = useStore((s) => s.users);
  const labels = useStore((s) => s.labels);

  const fileRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const toast = useToast();

  if (!hydrated) return null;

  const handleExport = () => {
    try {
      const payload = exportState();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `doodaboo-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Exported workspace to JSON");
    } catch (err) {
      toast.error(
        `Export failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (
        !payload ||
        typeof payload.version !== "number" ||
        !Array.isArray(payload.users) ||
        !Array.isArray(payload.labels) ||
        !Array.isArray(payload.projects) ||
        !Array.isArray(payload.tasks)
      ) {
        throw new Error("File does not look like a doodaboo export.");
      }
      importState(payload);
      toast.success("Workspace imported");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Import failed",
      );
    }
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: "Reset workspace",
      message:
        "All current projects, tasks, labels, posts and users will be replaced with the demo seed data. This can't be undone.",
      confirmLabel: "Reset to seed",
      destructive: true,
    });
    if (!ok) return;
    resetToSeed();
    toast.success("Reset to seed data");
  };

  return (
    <>
      <PageHeader kicker="Workspace" title="Settings" />
      <div className="p-4 grid grid-cols-12 gap-4 max-w-5xl">
        <section className="col-span-12 border-[1.5px] border-ink bg-paper">
          <Header>Workspace</Header>
          <div className="p-4 grid grid-cols-4 gap-3">
            <Stat label="Projects" value={projects.length} />
            <Stat label="Issues" value={tasks.length} />
            <Stat label="Members" value={users.length} />
            <Stat label="Labels" value={labels.length} />
          </div>
        </section>

        <section className="col-span-12 border-[1.5px] border-ink bg-paper">
          <Header>Appearance</Header>
          <div className="p-4 flex items-center gap-3 flex-wrap">
            <ThemeOption
              label="Light"
              value="light"
              current={theme}
              icon={<Sun size={14} />}
              onSelect={setTheme}
            />
            <ThemeOption
              label="Dark"
              value="dark"
              current={theme}
              icon={<Moon size={14} />}
              onSelect={setTheme}
            />
            <ThemeOption
              label="System"
              value="system"
              current={theme}
              icon={<Monitor size={14} />}
              onSelect={setTheme}
            />
            <div className="ml-auto font-mono text-[10px] uppercase tracking-widest text-ink/50">
              Color tokens swap via CSS variables — no reload needed.
            </div>
          </div>
        </section>

        <section className="col-span-12 lg:col-span-6 border-[1.5px] border-ink bg-paper">
          <Header>Export</Header>
          <div className="p-4 space-y-3">
            <p className="text-sm text-ink/70">
              Download a JSON snapshot of all workspace data — portable and
              human-readable. Use it as a backup or to hand off to someone else.
            </p>
            <Button
              variant="accent"
              iconLeft={<Download size={12} />}
              onClick={handleExport}
            >
              Export JSON
            </Button>
          </div>
        </section>

        <section className="col-span-12 lg:col-span-6 border-[1.5px] border-ink bg-paper">
          <Header>Import</Header>
          <div className="p-4 space-y-3">
            <p className="text-sm text-ink/70">
              Restore from a <span className="font-mono">doodaboo</span> export.
              This replaces the current workspace.
            </p>
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
            <Button
              variant="outline"
              iconLeft={<Upload size={12} />}
              onClick={() => fileRef.current?.click()}
            >
              Choose JSON file
            </Button>
          </div>
        </section>

        <section className="col-span-12 border-[1.5px] border-ink bg-paper">
          <Header>Danger zone</Header>
          <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Reset to demo data</div>
              <div className="text-xs text-ink/60">
                Replaces everything with the built-in seed workspace. Useful when
                demoing.
              </div>
            </div>
            <Button
              variant="danger"
              iconLeft={<RotateCcw size={12} />}
              onClick={handleReset}
            >
              Reset workspace
            </Button>
          </div>
        </section>
      </div>
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

function ThemeOption({
  label,
  value,
  current,
  icon,
  onSelect,
}: {
  label: string;
  value: Theme;
  current: Theme;
  icon: React.ReactNode;
  onSelect: (t: Theme) => void;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`inline-flex items-center gap-2 h-9 px-3 border-[1.5px] border-ink font-mono text-[11px] uppercase tracking-widest transition-all ${
        active
          ? "bg-ink text-paper -translate-y-[1px] shadow-brutal-sm"
          : "bg-paper hover:-translate-y-[1px] hover:shadow-brutal-sm"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-[1.5px] border-ink/20 p-2">
      <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
    </div>
  );
}
