"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { NewTaskModal } from "./NewTaskModal";
import { ShortcutsModal } from "./ShortcutsModal";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskProjectId, setNewTaskProjectId] = useState<string | undefined>(
    undefined,
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
    <div className="flex min-h-screen">
      <Sidebar
        onNewTask={() => openNewTask()}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
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
  );
}
