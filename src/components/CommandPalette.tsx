"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Columns2,
  FlaskConical,
  FolderKanban,
  Home,
  Inbox,
  Keyboard,
  ListTodo,
  Plus,
  Settings,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onNewTask,
  onOpenShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  onNewTask: (projectId?: string) => void;
  onOpenShortcuts: () => void;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const posts = useStore((s) => s.posts);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const items: CommandItem[] = useMemo(() => {
    const out: CommandItem[] = [
      {
        id: "new_task",
        label: "New issue",
        hint: "c",
        group: "Create",
        icon: <Plus size={12} />,
        onSelect: () => onNewTask(),
      },
      {
        id: "go_home",
        label: "Go to Dashboard",
        group: "Navigate",
        icon: <Home size={12} />,
        onSelect: () => {
          router.push("/");
          onClose();
        },
      },
      {
        id: "go_inbox",
        label: "Go to Inbox",
        group: "Navigate",
        icon: <Inbox size={12} />,
        onSelect: () => {
          router.push("/inbox");
          onClose();
        },
      },
      {
        id: "go_my",
        label: "Go to My Issues",
        group: "Navigate",
        icon: <ListTodo size={12} />,
        onSelect: () => {
          router.push("/my-issues");
          onClose();
        },
      },
      {
        id: "go_team",
        label: "Go to Team",
        group: "Navigate",
        icon: <Users size={12} />,
        onSelect: () => {
          router.push("/team");
          onClose();
        },
      },
      {
        id: "go_labels",
        label: "Go to Labels",
        group: "Navigate",
        icon: <Tag size={12} />,
        onSelect: () => {
          router.push("/labels");
          onClose();
        },
      },
      {
        id: "go_projects",
        label: "Go to All Projects",
        group: "Navigate",
        icon: <FolderKanban size={12} />,
        onSelect: () => {
          router.push("/projects");
          onClose();
        },
      },
      {
        id: "go_settings",
        label: "Go to Settings",
        group: "Navigate",
        icon: <Settings size={12} />,
        onSelect: () => {
          router.push("/settings");
          onClose();
        },
      },
      {
        id: "show_shortcuts",
        label: "Show keyboard shortcuts",
        hint: "?",
        group: "Help",
        icon: <Keyboard size={12} />,
        onSelect: onOpenShortcuts,
      },
      {
        id: "new_project",
        label: "New project",
        group: "Create",
        icon: <Plus size={12} />,
        onSelect: () => {
          router.push("/projects/new");
          onClose();
        },
      },
      {
        id: "new_post",
        label: "New post (virality predictor)",
        group: "Create",
        icon: <Sparkles size={12} />,
        onSelect: () => {
          router.push("/posts/new");
          onClose();
        },
      },
      {
        id: "go_posts",
        label: "Go to Posts",
        group: "Navigate",
        icon: <Sparkles size={12} />,
        onSelect: () => {
          router.push("/posts");
          onClose();
        },
      },
      {
        id: "go_insights",
        label: "Go to Posts Insights",
        group: "Navigate",
        icon: <BarChart3 size={12} />,
        onSelect: () => {
          router.push("/posts/insights");
          onClose();
        },
      },
      {
        id: "go_compare",
        label: "Compare posts",
        group: "Navigate",
        icon: <Columns2 size={12} />,
        onSelect: () => {
          router.push("/posts/compare");
          onClose();
        },
      },
      {
        id: "go_lab",
        label: "Open Hook Lab",
        group: "Create",
        icon: <FlaskConical size={12} />,
        onSelect: () => {
          router.push("/posts/lab");
          onClose();
        },
      },
      {
        id: "go_playbooks",
        label: "Go to Playbooks",
        group: "Navigate",
        icon: <BookOpen size={12} />,
        onSelect: () => {
          router.push("/playbooks");
          onClose();
        },
      },
      ...projects.map((p) => ({
        id: `proj_${p.id}`,
        label: `Open project · ${p.name}`,
        hint: p.key,
        group: "Projects",
        icon: (
          <span
            className="w-4 h-4 flex items-center justify-center border-[1.5px] border-ink font-mono text-[9px] font-bold"
            style={{ backgroundColor: p.accent }}
          >
            {p.icon}
          </span>
        ),
        onSelect: () => {
          router.push(`/projects/${p.id}`);
          onClose();
        },
      })),
      ...tasks.slice(0, 50).map((t) => {
        const p = projects.find((x) => x.id === t.projectId);
        return {
          id: `task_${t.id}`,
          label: t.title || "Untitled task",
          hint: p ? `${p.key}-${t.number}` : undefined,
          group: "Tasks",
          icon: <ArrowRight size={12} />,
          onSelect: () => {
            router.push(`/projects/${t.projectId}/tasks/${t.id}`);
            onClose();
          },
        };
      }),
      ...posts.slice(0, 30).map((p) => ({
        id: `post_${p.id}`,
        label: p.title || "Untitled post",
        hint: p.platform.replace("_", " "),
        group: "Posts",
        icon: <Sparkles size={12} />,
        onSelect: () => {
          router.push(`/posts/${p.id}`);
          onClose();
        },
      })),
    ];
    if (!q.trim()) return out;
    const needle = q.toLowerCase();
    return out.filter(
      (i) =>
        i.label.toLowerCase().includes(needle) ||
        (i.hint && i.hint.toLowerCase().includes(needle)) ||
        i.group.toLowerCase().includes(needle),
    );
  }, [q, projects, tasks, posts, router, onClose, onNewTask, onOpenShortcuts]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const i of items) {
      const list = map.get(i.group) ?? [];
      list.push(i);
      map.set(i.group, list);
    }
    return Array.from(map.entries());
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(items.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        items[idx]?.onSelect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, idx, items, onClose]);

  useEffect(() => setIdx(0), [q]);

  if (!open) return null;

  let runIdx = -1;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh]">
      <div
        className="absolute inset-0 bg-ink/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl border-[1.5px] border-ink bg-paper shadow-brutal-lg">
        <div className="border-b-[1.5px] border-ink">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or search…"
            className="w-full h-11 px-4 bg-paper text-sm placeholder:text-ink/40 focus:outline-none"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {grouped.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-ink/50">
              No results for “{q}”
            </div>
          )}
          {grouped.map(([group, list]) => (
            <div key={group} className="py-1">
              <div className="px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-ink/50">
                {group}
              </div>
              {list.map((i) => {
                runIdx += 1;
                const active = runIdx === idx;
                return (
                  <button
                    key={i.id}
                    onClick={i.onSelect}
                    onMouseEnter={() => {
                      const next = items.findIndex((x) => x.id === i.id);
                      if (next >= 0) setIdx(next);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 h-8 px-3 text-xs text-left transition-colors",
                      active ? "bg-ink text-paper" : "hover:bg-ink/5",
                    )}
                  >
                    <span className="w-4 flex justify-center">{i.icon}</span>
                    <span className="flex-1 truncate">{i.label}</span>
                    {i.hint && (
                      <span
                        className={cn(
                          "font-mono text-[9px] uppercase tracking-wider px-1 border-[1.5px]",
                          active ? "border-paper" : "border-ink/30 text-ink/60",
                        )}
                      >
                        {i.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="border-t-[1.5px] border-ink bg-paper-soft h-8 flex items-center px-3 gap-3 font-mono text-[9px] uppercase tracking-widest text-ink/50">
          <span>↑↓ navigate</span>
          <span>↩ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
