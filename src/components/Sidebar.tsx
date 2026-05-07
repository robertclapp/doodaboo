"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Columns2,
  Inbox,
  LayoutDashboard,
  ListTodo,
  FolderKanban,
  Users,
  Plus,
  Tag,
  Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/Avatar";
import { StatusIcon } from "./StatusIcon";

export function Sidebar({
  onNewTask,
  onOpenShortcuts,
}: {
  onNewTask: () => void;
  onOpenShortcuts: () => void;
}) {
  const pathname = usePathname();
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const currentUser = useStore((s) =>
    s.users.find((u) => u.id === s.currentUserId),
  );

  const myOpen = tasks.filter(
    (t) =>
      t.assigneeId === currentUser?.id &&
      t.status !== "done" &&
      t.status !== "cancelled",
  ).length;

  const item = (active: boolean) =>
    cn(
      "flex items-center gap-2 h-8 px-2 text-xs font-mono uppercase tracking-wide transition-colors border-l-[3px]",
      active
        ? "bg-ink text-paper border-accent"
        : "border-transparent hover:bg-ink/5",
    );

  return (
    <aside className="w-[240px] shrink-0 border-r-[1.5px] border-ink bg-paper-soft flex flex-col">
      <div className="h-12 border-b-[1.5px] border-ink flex items-center px-3 gap-2">
        <div className="w-6 h-6 bg-ink text-paper flex items-center justify-center font-mono font-bold text-xs">
          D
        </div>
        <div className="leading-tight">
          <div className="font-mono text-[11px] uppercase font-bold tracking-widest">
            Doodaboo
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-ink/50">
            project.os v0.1
          </div>
        </div>
      </div>

      {currentUser && (
        <div className="border-b-[1.5px] border-ink px-3 py-2 flex items-center gap-2">
          <Avatar user={currentUser} size={22} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">
              {currentUser.name}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50 truncate">
              @{currentUser.handle}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onNewTask}
        className="mx-3 my-3 h-9 flex items-center justify-between gap-2 border-[1.5px] border-ink bg-accent font-mono text-[11px] uppercase tracking-wider font-bold pl-2 pr-2 hover:-translate-y-[1px] hover:shadow-brutal-sm active:translate-y-[1px] active:shadow-none transition-all"
      >
        <span className="flex items-center gap-1.5">
          <Plus size={12} /> New Issue
        </span>
        <kbd className="font-mono text-[9px] bg-ink text-paper px-1 py-0.5">
          C
        </kbd>
      </button>

      <nav className="px-2 flex flex-col gap-0.5">
        <Link className={item(pathname === "/")} href="/">
          <LayoutDashboard size={12} /> Dashboard
        </Link>
        <Link
          className={item(pathname === "/inbox")}
          href="/inbox"
        >
          <Inbox size={12} /> Inbox
          {myOpen > 0 && (
            <span className="ml-auto bg-accent text-ink border-[1.5px] border-ink font-mono text-[9px] px-1">
              {myOpen}
            </span>
          )}
        </Link>
        <Link
          className={item(pathname.startsWith("/my-issues"))}
          href="/my-issues"
        >
          <ListTodo size={12} /> My Issues
        </Link>
        <Link
          className={item(pathname === "/team")}
          href="/team"
        >
          <Users size={12} /> Team
        </Link>
        <Link
          className={item(pathname === "/labels")}
          href="/labels"
        >
          <Tag size={12} /> Labels
        </Link>
        <Link
          className={item(pathname === "/posts" || (pathname.startsWith("/posts") && pathname !== "/posts/insights" && pathname !== "/posts/compare"))}
          href="/posts"
        >
          <Sparkles size={12} /> Posts
        </Link>
        <Link
          className={item(pathname === "/posts/insights")}
          href="/posts/insights"
        >
          <BarChart3 size={12} /> Insights
        </Link>
        <Link
          className={item(pathname === "/posts/compare")}
          href="/posts/compare"
        >
          <Columns2 size={12} /> Compare
        </Link>
        <Link
          className={item(pathname.startsWith("/playbooks"))}
          href="/playbooks"
        >
          <BookOpen size={12} /> Playbooks
        </Link>
      </nav>

      <div className="px-3 mt-5 mb-2 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
          Projects
        </div>
        <Link
          href="/projects"
          className="font-mono text-[10px] uppercase text-ink/50 hover:text-ink"
        >
          all →
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-0.5">
        {projects.map((p) => {
          const active = pathname.startsWith(`/projects/${p.id}`);
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className={item(active)}
            >
              <span
                className="w-4 h-4 flex items-center justify-center border-[1.5px] border-ink font-mono text-[9px] font-bold shrink-0"
                style={{ backgroundColor: p.accent }}
              >
                {p.icon}
              </span>
              <span className="truncate flex-1">{p.name}</span>
              <StatusIcon status={p.status} size={10} />
            </Link>
          );
        })}

        {projects.length === 0 && (
          <div className="px-2 py-3 text-[11px] text-ink/50 font-mono uppercase">
            No projects yet
          </div>
        )}

        <Link
          href="/projects/new"
          className="mt-2 flex items-center gap-2 h-8 px-2 text-[11px] font-mono uppercase tracking-wide border-[1.5px] border-dashed border-ink/40 text-ink/60 hover:border-ink hover:text-ink"
        >
          <FolderKanban size={12} /> New Project
        </Link>
      </div>

      <div className="border-t-[1.5px] border-ink p-2 flex items-center justify-between gap-2">
        <Link
          href="/settings"
          className="font-mono text-[9px] uppercase tracking-widest text-ink/40 hover:text-ink"
        >
          settings
        </Link>
        <button
          onClick={onOpenShortcuts}
          className="font-mono text-[9px] uppercase tracking-widest text-ink/40 hover:text-ink"
          title="Keyboard shortcuts (?)"
        >
          shortcuts ?
        </button>
      </div>
    </aside>
  );
}
