"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { PageHeader, Tab } from "@/components/PageHeader";
import { PlatformIcon } from "@/components/posts/PlatformIcon";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { Platform, PLATFORMS } from "@/lib/types";
import { PLAYBOOKS } from "@/lib/playbooks";

const CATEGORIES = ["all", "hook", "thread", "carousel", "longform", "trend", "engagement"] as const;

type Cat = (typeof CATEGORIES)[number];

export default function PlaybooksPage() {
  const hydrated = useHydrated();
  const posts = useStore((s) => s.posts);
  const [cat, setCat] = useState<Cat>("all");
  const [platform, setPlatform] = useState<Platform | "all">("all");

  const filtered = useMemo(
    () =>
      PLAYBOOKS.filter(
        (p) =>
          (cat === "all" || p.category === cat) &&
          (platform === "all" || p.platforms.includes(platform)),
      ),
    [cat, platform],
  );

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of posts) {
      if (p.playbookId) m.set(p.playbookId, (m.get(p.playbookId) ?? 0) + 1);
    }
    return m;
  }, [posts]);

  if (!hydrated) return null;

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title={
          <span className="flex items-center gap-2">
            <BookOpen size={14} /> Playbooks
          </span>
        }
        tabs={
          <>
            {CATEGORIES.map((c) => (
              <Tab key={c} active={cat === c} onClick={() => setCat(c)}>
                {c === "all" ? "All" : c}
              </Tab>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <select
                value={platform}
                onChange={(e) =>
                  setPlatform(e.target.value as Platform | "all")
                }
                className="h-7 px-2 border-[1.5px] border-ink bg-paper font-mono text-[10px] uppercase tracking-wider"
              >
                <option value="all">All platforms</option>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        }
      />
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((p) => {
          const used = usage.get(p.id) ?? 0;
          return (
            <Link
              key={p.id}
              href={`/playbooks/${p.id}`}
              className="border-[1.5px] border-ink bg-paper hover:-translate-y-[2px] hover:shadow-brutal transition-all flex flex-col"
            >
              <div className="border-b-[1.5px] border-ink px-3 h-9 flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink/60">
                  {p.category}
                </div>
                {used > 0 && (
                  <div className="font-mono text-[9px] uppercase tracking-widest border-[1.5px] border-ink px-1 h-5 inline-flex items-center bg-accent">
                    used by {used}
                  </div>
                )}
              </div>
              <div className="p-4 flex-1">
                <div className="text-lg font-bold leading-tight">{p.name}</div>
                <div className="mt-1 text-sm text-ink/70">{p.description}</div>
              </div>
              <div className="border-t-[1.5px] border-ink/10 px-3 h-9 flex items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mr-auto">
                  Platforms
                </span>
                {p.platforms.map((pl) => (
                  <PlatformIcon key={pl} platform={pl} size={16} />
                ))}
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full border-[1.5px] border-dashed border-ink/30 p-8 text-center">
            <div className="font-mono text-[11px] uppercase tracking-widest text-ink/60">
              No playbooks match the filter
            </div>
          </div>
        )}
      </div>
    </>
  );
}
