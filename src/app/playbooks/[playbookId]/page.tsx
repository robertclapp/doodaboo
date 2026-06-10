"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PlatformIcon } from "@/components/posts/PlatformIcon";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { getPlaybook } from "@/lib/playbooks";
import { describeBand, scoreIntrinsic, scoreLive } from "@/lib/virality";

export default function PlaybookDetailPage() {
  const hydrated = useHydrated();
  const { playbookId } = useParams<{ playbookId: string }>();
  const playbook = getPlaybook(playbookId);
  const posts = useStore((s) => s.posts);

  const usingThis = useMemo(
    () => posts.filter((p) => p.playbookId === playbook?.id),
    [posts, playbook?.id],
  );

  if (!hydrated) return null;
  if (!playbook) {
    return (
      <div className="p-8 font-mono uppercase text-sm">
        Playbook not found.{" "}
        <Link href="/playbooks" className="underline">
          Back to playbooks
        </Link>
      </div>
    );
  }

  const avgScore =
    usingThis.length > 0
      ? usingThis.reduce((s, p) => {
          const score = scoreLive(p) ?? scoreIntrinsic(p);
          return s + score.value;
        }, 0) / usingThis.length
      : null;

  return (
    <>
      <PageHeader
        kicker={
          <Link
            href="/playbooks"
            className="flex items-center gap-1 hover:text-ink"
          >
            <ArrowLeft size={11} /> Playbooks
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            <BookOpen size={14} /> {playbook.name}
          </span>
        }
      />
      <div className="p-4 grid grid-cols-12 gap-4">
        <section className="col-span-12 md:col-span-7 border-[1.5px] border-ink bg-paper">
          <div className="border-b-[1.5px] border-ink px-4 h-9 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
            About
          </div>
          <div className="p-4 space-y-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-1">
                Description
              </div>
              <p className="text-sm text-ink/80">{playbook.description}</p>
            </div>
            {playbook.hookHint && (
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-1">
                  Hook pattern
                </div>
                <div className="border-l-[3px] border-accent pl-3 text-sm text-ink/80 italic">
                  {playbook.hookHint}
                </div>
              </div>
            )}
            {playbook.captionHint && (
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-1">
                  Caption pattern
                </div>
                <div className="border-l-[3px] border-accent pl-3 text-sm text-ink/80 italic">
                  {playbook.captionHint}
                </div>
              </div>
            )}
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-1">
                Notes
              </div>
              <ul className="space-y-1.5">
                {playbook.notes.map((n, i) => (
                  <li key={i} className="text-sm text-ink/80">
                    · {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <aside className="col-span-12 md:col-span-5 space-y-4">
          <div className="border-[1.5px] border-ink bg-paper">
            <div className="border-b-[1.5px] border-ink px-4 h-9 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
              Configuration
            </div>
            <dl className="p-4 text-xs space-y-2">
              <Row label="Category">{playbook.category}</Row>
              <Row label="Format">{playbook.format ?? "—"}</Row>
              {playbook.durationOverride != null && (
                <Row label="Duration">{playbook.durationOverride}s</Row>
              )}
              <Row label="Platforms">
                <span className="flex flex-wrap gap-1">
                  {playbook.platforms.map((pl) => (
                    <PlatformIcon key={pl} platform={pl} size={16} />
                  ))}
                </span>
              </Row>
              {playbook.defaultHashtags && (
                <Row label="Hashtags">
                  {playbook.defaultHashtags.length === 0
                    ? "—"
                    : playbook.defaultHashtags.map((t) => `#${t}`).join(" ")}
                </Row>
              )}
              {playbook.contextDefaults?.postingHour != null && (
                <Row label="Target hour">
                  {playbook.contextDefaults.postingHour}:00
                </Row>
              )}
              {playbook.contextDefaults?.sentiment && (
                <Row label="Sentiment">
                  {playbook.contextDefaults.sentiment}
                </Row>
              )}
            </dl>
          </div>

          <div className="border-[1.5px] border-ink bg-paper">
            <div className="border-b-[1.5px] border-ink px-4 h-9 flex items-center justify-between">
              <div className="font-mono text-[11px] uppercase tracking-widest font-bold">
                Used by · {usingThis.length}
              </div>
              {avgScore != null && (
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink/60">
                  avg score {avgScore.toFixed(1)}
                </div>
              )}
            </div>
            {usingThis.length === 0 ? (
              <div className="p-4 font-mono text-[10px] uppercase tracking-widest text-ink/50 text-center">
                Apply this playbook on a post composer to see usage here.
              </div>
            ) : (
              <ul>
                {usingThis.map((p) => {
                  const score = scoreLive(p) ?? scoreIntrinsic(p);
                  const tone = describeBand(score.band).tone;
                  return (
                    <li
                      key={p.id}
                      className="grid grid-cols-[28px_auto_1fr_auto] items-center gap-2 px-3 h-9 border-b-[1.5px] border-ink/10 last:border-b-0"
                    >
                      <PlatformIcon platform={p.platform} size={20} />
                      <span
                        className="inline-flex items-center justify-center w-9 h-6 border-[1.5px] border-ink font-mono text-xs font-bold tabular-nums"
                        style={{ backgroundColor: tone }}
                      >
                        {score.value.toFixed(0)}
                      </span>
                      <Link
                        href={`/posts/${p.id}`}
                        className="truncate text-sm hover:underline"
                      >
                        {p.title || "Untitled"}
                      </Link>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                        {describeBand(score.band).label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-ink/50 capitalize">
        {label}
      </dt>
      <dd className="capitalize">{children}</dd>
    </div>
  );
}
