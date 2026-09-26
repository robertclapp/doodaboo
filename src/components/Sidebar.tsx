"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import {
  BarChart3,
  BookOpen,
  Columns2,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  ListTodo,
  FolderKanban,
  Users,
  Plus,
  Tag,
  Sparkles,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/Avatar";
import { StatusIcon } from "./StatusIcon";
import { ROUTE_PATHS, routes } from "@/lib/routes";
import { useIdParam } from "@/lib/route-hooks";
import type { Project, Task } from "@/lib/types";

/**
 * The project list with at most one entry highlighted. Pure — it reads no
 * URL state — so it doubles as the Suspense fallback below with nothing
 * highlighted.
 */
function ProjectNavLinks({
  projects,
  activeProjectId,
  itemClass,
  onNavigate,
}: {
  projects: Project[];
  activeProjectId: string | undefined;
  itemClass: (active: boolean) => string;
  onNavigate: () => void;
}) {
  return (
    <>
      {projects.map((p) => (
        <Link
          key={p.id}
          href={routes.project(p.id)}
          className={itemClass(p.id === activeProjectId)}
          // Project pages share one pathname and differ only by ?id=, so the
          // pathname-based drawer close below never fires for project →
          // project; close explicitly on the click instead.
          onClick={onNavigate}
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
      ))}
    </>
  );
}

/**
 * Resolves which project the current URL belongs to and renders the list.
 * Record pages carry their id in the query (see src/lib/routes.ts), so this
 * reads `?id=` — on the project view it is the project itself; on a task
 * view it is the task's project, which preserves the old behavior of keeping
 * a project highlighted while working inside one of its tasks. Reading search
 * params requires a Suspense boundary, so this stays a leaf: the rest of the
 * sidebar still prerenders.
 */
function ActiveProjectNavLinks({
  projects,
  tasks,
  pathname,
  itemClass,
  onNavigate,
}: {
  projects: Project[];
  tasks: Task[];
  pathname: string;
  itemClass: (active: boolean) => string;
  onNavigate: () => void;
}) {
  const id = useIdParam();
  const activeProjectId =
    pathname === ROUTE_PATHS.project
      ? id
      : pathname === ROUTE_PATHS.task
        ? tasks.find((t) => t.id === id)?.projectId
        : undefined;
  return (
    <ProjectNavLinks
      projects={projects}
      activeProjectId={activeProjectId}
      itemClass={itemClass}
      onNavigate={onNavigate}
    />
  );
}

export function Sidebar({
  onNewTask,
  onOpenShortcuts,
  mobileOpen,
  onMobileClose,
}: {
  onNewTask: () => void;
  onOpenShortcuts: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
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
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-ink/60 backdrop-blur-[2px] z-40 lg:hidden transition-opacity",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onMobileClose}
        aria-hidden
      />
      <aside
        className={cn(
          "w-[260px] shrink-0 border-r-[1.5px] border-ink bg-paper-soft flex flex-col",
          // Desktop: static. Mobile: fixed drawer that slides in from the left.
          "fixed lg:static inset-y-0 left-0 z-50 transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        aria-label="Primary navigation"
      >
        <div className="h-12 border-b-[1.5px] border-ink flex items-center px-3 gap-2">
          <div className="w-6 h-6 bg-ink text-paper flex items-center justify-center font-mono font-bold text-xs">
            D
          </div>
          <div className="leading-tight flex-1">
            <div className="font-mono text-[11px] uppercase font-bold tracking-widest">
              Doodaboo
            </div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-ink/50">
              project.os v0.1
            </div>
          </div>
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1 hover:bg-ink hover:text-paper transition-colors"
            aria-label="Close navigation"
          >
            <X size={14} />
          </button>
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
          className={item(pathname === "/posts/lab")}
          href="/posts/lab"
        >
          <FlaskConical size={12} /> Hook Lab
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
        <Suspense
          fallback={
            <ProjectNavLinks
              projects={projects}
              activeProjectId={undefined}
              itemClass={item}
              onNavigate={onMobileClose}
            />
          }
        >
          <ActiveProjectNavLinks
            projects={projects}
            tasks={tasks}
            pathname={pathname}
            itemClass={item}
            onNavigate={onMobileClose}
          />
        </Suspense>

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
    </>
  );
}
