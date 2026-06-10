"use client";

import { useCallback, useEffect, useState } from "react";
import { Menu, Search } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { NewTaskModal } from "./NewTaskModal";
import { ShortcutsModal } from "./ShortcutsModal";
import { ToastProvider } from "./ToastProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskProjectId, setNewTaskProjectId] = useState<string | undefined>(
    undefined,
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const anyModalOpen = paletteOpen || newTaskOpen || shortcutsOpen;

  const openNewTask = useCallback((projectId?: string) => {
    setNewTaskProjectId(projectId);
    setNewTaskOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      if (isEditing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key.toLowerCase() === "c" && !anyModalOpen) {
        e.preventDefault();
        openNewTask();
        return;
      }

      if (e.key === "?" && !anyModalOpen) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyModalOpen, openNewTask]);

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar
          onNewTask={() => openNewTask()}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="lg:hidden h-12 border-b-[1.5px] border-ink bg-paper flex items-center px-3 gap-2 sticky top-0 z-30">
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="p-1.5 border-[1.5px] border-ink hover:bg-ink hover:text-paper transition-colors"
            >
              <Menu size={14} />
            </button>
            <div className="flex-1 font-mono text-[11px] uppercase font-bold tracking-widest">
              Doodaboo
            </div>
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              className="p-1.5 border-[1.5px] border-ink hover:bg-ink hover:text-paper transition-colors"
            >
              <Search size={14} />
            </button>
          </div>
          {children}
        </main>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNewTask={(projectId) => {
            setPaletteOpen(false);
            openNewTask(projectId);
          }}
          onOpenShortcuts={() => {
            setPaletteOpen(false);
            setShortcutsOpen(true);
          }}
        />
        <NewTaskModal
          open={newTaskOpen}
          onClose={() => setNewTaskOpen(false)}
          defaultProjectId={newTaskProjectId}
        />
        <ShortcutsModal
          open={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
        />
      </div>
    </ToastProvider>
  );
}
