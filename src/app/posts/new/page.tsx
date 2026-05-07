"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { PostComposer } from "@/components/posts/PostComposer";
import { Recommendations } from "@/components/posts/Recommendations";
import { PlaybookPicker } from "@/components/posts/PlaybookPicker";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { Platform, Post, PostStatus } from "@/lib/types";
import { recommend } from "@/lib/virality";

export default function NewPostPage() {
  const hydrated = useHydrated();
  const projects = useStore((s) => s.projects);
  const createPost = useStore((s) => s.createPost);
  const router = useRouter();

  const [draft, setDraft] = useState<Post>(() => emptyDraft());

  const change = (patch: Partial<Post>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const submit = (status: PostStatus) => {
    if (!draft.title.trim()) return;
    const created = createPost({
      title: draft.title.trim(),
      platform: draft.platform,
      content: draft.content,
      context: draft.context,
      threshold: draft.threshold,
      projectId: draft.projectId,
      status,
      scheduledAt: status === "scheduled" ? draft.scheduledAt : undefined,
      postedAt: status === "live" ? new Date().toISOString() : undefined,
    });
    router.push(`/posts/${created.id}`);
  };

  const projectOptions = useMemo(
    () => [{ id: "", name: "—" }, ...projects.map((p) => ({ id: p.id, name: `${p.key} · ${p.name}` }))],
    [projects],
  );

  if (!hydrated) return null;

  return (
    <>
      <PageHeader
        kicker={
          <Link href="/posts" className="flex items-center gap-1 hover:text-ink">
            <ArrowLeft size={11} /> Posts
          </Link>
        }
        title="New post"
        trailing={
          <>
            <PlaybookPicker
              post={draft}
              onApply={({ content, context, playbookId }) =>
                change({ content, context, playbookId })
              }
            />
            <Button variant="ghost" onClick={() => router.push("/posts")}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => submit("draft")}
              disabled={!draft.title.trim()}
            >
              Save as draft
            </Button>
            <Button
              variant="accent"
              onClick={() => submit("live")}
              disabled={!draft.title.trim()}
            >
              Mark live
            </Button>
          </>
        }
      />
      <div className="border-b-[1.5px] border-ink bg-paper-soft px-4 py-3 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
          Link to project
        </span>
        <select
          value={draft.projectId ?? ""}
          onChange={(e) =>
            change({ projectId: e.target.value || undefined })
          }
          className="h-7 px-2 border-[1.5px] border-ink bg-paper font-mono text-[10px] uppercase tracking-wider"
        >
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <PostComposer
        draft={draft}
        onChange={change}
        rightSlot={<Recommendations items={recommend(draft)} />}
      />
    </>
  );
}

function emptyDraft(): Post {
  const now = new Date();
  return {
    id: "draft_local",
    title: "",
    platform: "tiktok" as Platform,
    status: "draft",
    threshold: { metric: "views", value: 100000, window: "7d" },
    snapshots: [],
    content: {
      hook: "",
      caption: "",
      hashtags: [],
      transcript: "",
      format: "video",
      durationSec: 22,
      hasTrendingAudio: false,
    },
    context: {
      audienceSize: 1000,
      accountAvgViews: 200,
      postingHour: now.getHours(),
      dayOfWeek: now.getDay(),
      topicCategory: "general",
      novelty: 3,
      emotion: 3,
      trendMatch: 3,
      sentiment: "neutral",
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
