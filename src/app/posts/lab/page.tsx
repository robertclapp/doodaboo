"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Columns2, FlaskConical, Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { PlatformIcon } from "@/components/posts/PlatformIcon";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { useToast } from "@/components/ToastProvider";
import { Platform, PLATFORMS, Post } from "@/lib/types";
import {
  generateHooks,
  HOOK_FAMILIES,
  HookFamily,
  variantsForPlatform,
} from "@/lib/hooks-generator";
import { describeBand, scoreIntrinsic } from "@/lib/virality";

export default function HookLabPage() {
  const hydrated = useHydrated();
  const router = useRouter();
  const toast = useToast();
  const createPost = useStore((s) => s.createPost);

  const [subject, setSubject] = useState("");
  const [audience, setAudience] = useState("");
  const [platform, setPlatform] = useState<Platform | "all">("tiktok");
  const [families, setFamilies] = useState<Set<HookFamily>>(
    new Set(HOOK_FAMILIES.map((f) => f.id)),
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const variants = useMemo(() => {
    if (!subject.trim()) return [];
    const all = generateHooks({ subject, audience: audience || undefined });
    return variantsForPlatform(all, platform).filter((v) =>
      families.has(v.template.family),
    );
  }, [subject, audience, platform, families]);

  // Score each variant by spawning a virtual draft.
  const scored = useMemo(
    () =>
      variants.map((v) => {
        const post = draftFromHook(v.hook, platform === "all" ? "tiktok" : platform);
        const score = scoreIntrinsic(post);
        return { variant: v, score };
      }),
    [variants, platform],
  );

  const toggleFamily = (id: HookFamily) => {
    setFamilies((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePick = (id: string) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const spawnDraft = (hook: string) => {
    const targetPlatform = platform === "all" ? "tiktok" : platform;
    const post = createPost({
      title: hook.slice(0, 60),
      platform: targetPlatform,
      content: makeContent(hook, targetPlatform),
      context: makeContext(),
    });
    toast.success("Draft created");
    router.push(`/posts/${post.id}`);
  };

  const spawnComparison = () => {
    if (picked.size < 2) {
      toast.error("Pick at least 2 variants to compare");
      return;
    }
    const targetPlatform = platform === "all" ? "tiktok" : platform;
    const ids: string[] = [];
    for (const id of picked) {
      const v = variants.find((x) => x.id === id);
      if (!v) continue;
      const post = createPost({
        title: v.hook.slice(0, 60),
        platform: targetPlatform,
        content: makeContent(v.hook, targetPlatform),
        context: makeContext(),
      });
      ids.push(post.id);
      if (ids.length >= 4) break;
    }
    toast.success(`Spawned ${ids.length} drafts`);
    router.push(`/posts/compare?ids=${ids.join(",")}`);
  };

  if (!hydrated) return null;

  return (
    <>
      <PageHeader
        kicker={
          <Link href="/posts" className="flex items-center gap-1 hover:text-ink">
            <ArrowLeft size={11} /> Posts
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            <FlaskConical size={14} /> Hook Lab
          </span>
        }
        trailing={
          <Button
            variant="accent"
            iconLeft={<Columns2 size={12} />}
            onClick={spawnComparison}
            disabled={picked.size < 2}
          >
            Compare picked ({picked.size})
          </Button>
        }
      />

      <div className="border-b-[1.5px] border-ink bg-paper-soft p-4 grid grid-cols-12 gap-3">
        <div className="col-span-12 md:col-span-5">
          <Label>Subject (what's the post about?)</Label>
          <Input
            autoFocus
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="pricing pages, ai onboarding, brutalist UI…"
          />
        </div>
        <div className="col-span-12 md:col-span-3">
          <Label>Audience (optional)</Label>
          <Input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="founders, designers, marketers…"
          />
        </div>
        <div className="col-span-12 md:col-span-4">
          <Label>Target platform</Label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform | "all")}
            className="w-full h-9 px-3 bg-paper border-[1.5px] border-ink text-sm"
          >
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-12 flex items-center flex-wrap gap-1.5 pt-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mr-1">
            Families
          </span>
          {HOOK_FAMILIES.map((f) => {
            const on = families.has(f.id);
            return (
              <button
                key={f.id}
                onClick={() => toggleFamily(f.id)}
                className={`h-7 px-2 border-[1.5px] border-ink font-mono text-[10px] uppercase tracking-widest ${
                  on ? "bg-ink text-paper" : "bg-paper"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {!subject.trim() ? (
        <div className="p-8">
          <div className="border-[1.5px] border-dashed border-ink/30 bg-paper p-8 text-center max-w-xl mx-auto">
            <Sparkles size={28} className="mx-auto text-ink/40 mb-3" />
            <div className="font-mono text-[11px] uppercase tracking-widest text-ink/60">
              Type a subject above to get started
            </div>
            <div className="mt-2 text-sm text-ink/60 max-w-md mx-auto">
              The Hook Lab generates 16 platform-aware hook variants from a
              short subject phrase. Pick the strongest ones, spawn them as
              drafts, and stage a head-to-head Compare with one click.
            </div>
          </div>
        </div>
      ) : (
        <ul className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {scored.map(({ variant, score }) => {
            const tone = describeBand(score.band).tone;
            const on = picked.has(variant.id);
            return (
              <li
                key={variant.id}
                className={`border-[1.5px] border-ink bg-paper flex flex-col transition-all ${
                  on ? "shadow-brutal -translate-x-[1px] -translate-y-[1px]" : ""
                }`}
              >
                <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center w-9 h-6 border-[1.5px] border-ink font-mono text-xs font-bold tabular-nums"
                    style={{ backgroundColor: tone }}
                  >
                    {score.value.toFixed(0)}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                    {variant.template.family}
                  </span>
                  <div className="ml-auto flex items-center gap-0.5">
                    {variant.fits.slice(0, 4).map((p) => (
                      <PlatformIcon key={p} platform={p} size={14} />
                    ))}
                  </div>
                </div>
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <div className="text-base font-semibold leading-snug">
                    {variant.hook}
                  </div>
                  <div className="text-xs text-ink/50 leading-snug">
                    {variant.template.why}
                  </div>
                </div>
                <div className="border-t-[1.5px] border-ink/10 px-3 py-2 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => togglePick(variant.id)}
                      className="appearance-none w-3.5 h-3.5 border-[1.5px] border-ink bg-paper checked:bg-ink"
                    />
                    <span className="font-mono text-[10px] uppercase tracking-widest">
                      Pick for compare
                    </span>
                  </label>
                  <Button
                    variant="accent"
                    size="sm"
                    iconLeft={<Plus size={11} />}
                    onClick={() => spawnDraft(variant.hook)}
                  >
                    Use this
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function draftFromHook(hook: string, platform: Platform): Post {
  return {
    id: "draft_lab",
    title: hook,
    platform,
    status: "draft",
    threshold: { metric: "views", value: 100000, window: "7d" },
    snapshots: [],
    content: makeContent(hook, platform),
    context: makeContext(),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeContent(hook: string, platform: Platform): Post["content"] {
  const isVideo =
    platform === "tiktok" ||
    platform === "reels" ||
    platform === "shorts" ||
    platform === "facebook";
  return {
    hook,
    caption: "",
    hashtags: [],
    transcript: "",
    format: isVideo ? "video" : platform === "instagram_feed" ? "carousel" : "text",
    durationSec: isVideo ? 21 : undefined,
    hasTrendingAudio:
      platform === "tiktok" || platform === "reels",
  };
}

function makeContext(): Post["context"] {
  const d = new Date();
  return {
    audienceSize: 1000,
    accountAvgViews: 200,
    postingHour: d.getHours(),
    dayOfWeek: d.getDay(),
    topicCategory: "general",
    novelty: 4,
    emotion: 4,
    trendMatch: 3,
    sentiment: "controversial",
  };
}
