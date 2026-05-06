"use client";

import { useMemo } from "react";
import {
  Platform,
  PLATFORMS,
  Post,
  PostContent,
  PostContext,
  PostFormat,
  POST_FORMATS,
} from "@/lib/types";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { PlatformIcon } from "./PlatformIcon";
import { ScoreGauge } from "./ScoreGauge";
import { FactorTable } from "./FactorTable";
import { scoreIntrinsic, platformProfile } from "@/lib/virality";

const SENTIMENTS: PostContext["sentiment"][] = [
  "neutral",
  "positive",
  "negative",
  "controversial",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PostComposer({
  draft,
  onChange,
  rightSlot,
  liveBanner,
}: {
  draft: Post;
  onChange: (patch: Partial<Post>) => void;
  rightSlot?: React.ReactNode;
  liveBanner?: React.ReactNode;
}) {
  const intrinsic = useMemo(() => scoreIntrinsic(draft), [draft]);
  const profile = platformProfile(draft.platform);

  const setContent = (patch: Partial<PostContent>) =>
    onChange({ content: { ...draft.content, ...patch } });
  const setContext = (patch: Partial<PostContext>) =>
    onChange({ context: { ...draft.context, ...patch } });

  return (
    <div className="grid grid-cols-12 gap-0">
      <div className="col-span-12 lg:col-span-8 border-r-[1.5px] border-ink px-5 py-5 space-y-5">
        <div>
          <Label>Title (internal)</Label>
          <Input
            value={draft.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Working title — viewers never see this"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Platform</Label>
            <PlatformGrid
              value={draft.platform}
              onChange={(p) => onChange({ platform: p })}
            />
          </div>
          <div>
            <Label>Format</Label>
            <FormatGrid
              value={draft.content.format}
              prefs={profile.formatPreference}
              onChange={(f) => setContent({ format: f })}
            />
          </div>
        </div>

        <div>
          <Label>Hook (first line / first 2 seconds)</Label>
          <Input
            value={draft.content.hook}
            onChange={(e) => setContent({ hook: e.target.value })}
            placeholder="Stop scrolling — this changes how you think about X"
          />
          <Hint>
            {draft.content.hook.trim().split(/\s+/).filter(Boolean).length} words ·
            ideal 4–8.
          </Hint>
        </div>

        <div>
          <Label>Caption / body</Label>
          <Textarea
            rows={5}
            value={draft.content.caption}
            onChange={(e) => setContent({ caption: e.target.value })}
            placeholder="The bulk of the post — context, payoff, call to action."
          />
          <Hint>
            {draft.content.caption.length} chars · target ≈
            {profile.captionSweet.ideal}.
          </Hint>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Hashtags (comma or space separated)</Label>
            <Input
              value={draft.content.hashtags.join(" ")}
              onChange={(e) =>
                setContent({
                  hashtags: e.target.value
                    .split(/[\s,]+/)
                    .map((s) => s.replace(/^#/, "").trim())
                    .filter(Boolean),
                })
              }
              placeholder="brutalism design indiehacker"
            />
            <Hint>
              {draft.content.hashtags.length} tags · target ≈
              {profile.hashtagsSweet.ideal}.
            </Hint>
          </div>
          <div>
            <Label>Video duration (sec)</Label>
            <Input
              type="number"
              min={0}
              max={3600}
              value={draft.content.durationSec ?? ""}
              onChange={(e) =>
                setContent({
                  durationSec: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              placeholder="—"
              disabled={
                draft.content.format !== "video" &&
                draft.content.format !== "live"
              }
            />
            {profile.videoTargetSec && (
              <Hint>
                Target {profile.videoTargetSec.ideal}s ({profile.videoTargetSec.min}
                –{profile.videoTargetSec.max}s).
              </Hint>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="trending-audio"
            type="checkbox"
            checked={draft.content.hasTrendingAudio}
            onChange={(e) => setContent({ hasTrendingAudio: e.target.checked })}
            className="appearance-none w-4 h-4 border-[1.5px] border-ink bg-paper checked:bg-ink"
          />
          <label
            htmlFor="trending-audio"
            className="font-mono text-[11px] uppercase tracking-widest"
          >
            Riding a trending audio / sound
          </label>
        </div>

        <details className="border-[1.5px] border-ink bg-paper">
          <summary className="cursor-pointer h-9 px-3 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
            Transcript (optional)
          </summary>
          <div className="p-3 border-t-[1.5px] border-ink/10">
            <Textarea
              rows={5}
              value={draft.content.transcript}
              onChange={(e) => setContent({ transcript: e.target.value })}
              placeholder="Paste the transcript or full text. Used as future training signal."
            />
          </div>
        </details>

        <div className="border-[1.5px] border-ink bg-paper-soft p-4">
          <div className="font-mono text-[11px] uppercase tracking-widest font-bold mb-3">
            Context signals
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label>Audience size</Label>
              <Input
                type="number"
                min={0}
                value={draft.context.audienceSize}
                onChange={(e) =>
                  setContext({ audienceSize: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <Label>Recent avg views</Label>
              <Input
                type="number"
                min={0}
                value={draft.context.accountAvgViews}
                onChange={(e) =>
                  setContext({ accountAvgViews: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <Label>Topic category</Label>
              <Input
                value={draft.context.topicCategory}
                onChange={(e) =>
                  setContext({ topicCategory: e.target.value })
                }
                placeholder="design, ai, business…"
              />
            </div>
            <div>
              <Label>Posting hour (0–23)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={draft.context.postingHour}
                onChange={(e) =>
                  setContext({
                    postingHour: clampInt(e.target.value, 0, 23, 12),
                  })
                }
              />
            </div>
            <div>
              <Label>Day of week</Label>
              <select
                value={draft.context.dayOfWeek}
                onChange={(e) =>
                  setContext({ dayOfWeek: Number(e.target.value) })
                }
                className="w-full h-9 px-3 bg-paper border-[1.5px] border-ink text-sm"
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Sentiment</Label>
              <select
                value={draft.context.sentiment}
                onChange={(e) =>
                  setContext({
                    sentiment: e.target.value as PostContext["sentiment"],
                  })
                }
                className="w-full h-9 px-3 bg-paper border-[1.5px] border-ink text-sm capitalize"
              >
                {SENTIMENTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Slider
              label="Novelty"
              value={draft.context.novelty}
              onChange={(v) =>
                setContext({ novelty: v as PostContext["novelty"] })
              }
            />
            <Slider
              label="Emotion"
              value={draft.context.emotion}
              onChange={(v) =>
                setContext({ emotion: v as PostContext["emotion"] })
              }
            />
            <Slider
              label="Trend match"
              value={draft.context.trendMatch}
              onChange={(v) =>
                setContext({ trendMatch: v as PostContext["trendMatch"] })
              }
            />
          </div>
        </div>
      </div>

      <aside className="col-span-12 lg:col-span-4 px-5 py-5 space-y-4">
        {liveBanner}
        <ScoreGauge
          score={intrinsic}
          label="Intrinsic score"
          sublabel={`Pre-publish · ${PLATFORMS.find((p) => p.id === draft.platform)?.label}`}
        />
        <FactorTable factors={intrinsic.factors} />
        {rightSlot}
      </aside>
    </div>
  );
}

function PlatformGrid({
  value,
  onChange,
}: {
  value: Platform;
  onChange: (p: Platform) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {PLATFORMS.map((p) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`h-12 flex flex-col items-center justify-center gap-1 border-[1.5px] border-ink ${
              active
                ? "bg-ink text-paper -translate-y-[1px] shadow-brutal-sm"
                : "bg-paper hover:-translate-y-[1px] hover:shadow-brutal-sm"
            } transition-all`}
            title={p.label}
          >
            <PlatformIcon platform={p.id} size={16} />
            <span className="font-mono text-[9px] uppercase tracking-widest">
              {p.short}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FormatGrid({
  value,
  prefs,
  onChange,
}: {
  value: PostFormat;
  prefs: Record<PostFormat, number>;
  onChange: (f: PostFormat) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {POST_FORMATS.map((f) => {
        const active = f.id === value;
        const fit = prefs[f.id] ?? 0;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className={`h-12 flex flex-col items-center justify-center border-[1.5px] border-ink ${
              active
                ? "bg-ink text-paper -translate-y-[1px] shadow-brutal-sm"
                : "bg-paper hover:-translate-y-[1px] hover:shadow-brutal-sm"
            } transition-all`}
            title={`${f.label} · ${(fit * 100).toFixed(0)}% fit`}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest">
              {f.label}
            </span>
            <span
              className={`text-[8px] font-mono ${active ? "text-paper/70" : "text-ink/40"}`}
            >
              {(fit * 100).toFixed(0)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-ink/60 mb-1">
        <span>{label}</span>
        <span className="text-ink">{value} / 5</span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-7 border-[1.5px] border-ink font-mono text-[11px] ${
              n <= value
                ? "bg-ink text-paper"
                : "bg-paper hover:bg-ink/5"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink/50">
      {children}
    </div>
  );
}

function clampInt(v: string, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}
