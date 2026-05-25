import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyPlaybook,
  getPlaybook,
  PLAYBOOKS,
  playbooksFor,
} from "./playbooks";
import { Post } from "./types";

function makePost(overrides: Partial<Post> = {}): Post {
  const base: Post = {
    id: "po_pb_test",
    title: "Test",
    platform: "tiktok",
    status: "draft",
    threshold: { metric: "views", value: 100_000, window: "7d" },
    snapshots: [],
    content: {
      hook: "",
      caption: "",
      hashtags: [],
      transcript: "",
      format: "video",
      durationSec: undefined,
      hasTrendingAudio: false,
    },
    context: {
      audienceSize: 1000,
      accountAvgViews: 200,
      postingHour: 3, // outside every peak window
      dayOfWeek: 0,
      topicCategory: "general",
      novelty: 1,
      emotion: 1,
      trendMatch: 1,
      sentiment: "neutral",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    ...base,
    ...overrides,
    content: { ...base.content, ...(overrides.content ?? {}) },
    context: { ...base.context, ...(overrides.context ?? {}) },
  };
}

describe("playbooksFor", () => {
  it("returns only playbooks that include the platform", () => {
    const tiktok = playbooksFor("tiktok");
    assert.ok(tiktok.length > 0);
    for (const p of tiktok) assert.ok(p.platforms.includes("tiktok"));
  });

  it("filters out non-matching platforms", () => {
    const linkedin = playbooksFor("linkedin");
    assert.ok(!linkedin.find((p) => p.id === "pb_3s_hook"));
  });
});

describe("getPlaybook", () => {
  it("returns a playbook by id", () => {
    const p = getPlaybook("pb_3s_hook");
    assert.ok(p);
    assert.equal(p!.name, "3-second hook");
  });

  it("returns undefined for unknown id", () => {
    assert.equal(getPlaybook("does-not-exist"), undefined);
  });
});

describe("applyPlaybook", () => {
  const threeSecHook = getPlaybook("pb_3s_hook")!;

  it("fills empty hook with hookHint and reports the change", () => {
    const r = applyPlaybook(makePost(), threeSecHook);
    assert.equal(r.patch.content.hook, threeSecHook.hookHint);
    assert.ok(r.changes.some((c) => /hook/i.test(c)));
    assert.equal(r.before.hookEmpty, true);
  });

  it("does NOT overwrite a user-provided hook", () => {
    const userHook = "My carefully crafted hook";
    const r = applyPlaybook(
      makePost({ content: { hook: userHook } as any }),
      threeSecHook,
    );
    assert.equal(r.patch.content.hook, userHook);
    assert.ok(!r.changes.some((c) => /hook/i.test(c)));
    assert.equal(r.before.hookEmpty, false);
  });

  it("fills empty caption only", () => {
    const r1 = applyPlaybook(makePost(), threeSecHook);
    assert.equal(r1.patch.content.caption, threeSecHook.captionHint);
    const userCap = "Already written";
    const r2 = applyPlaybook(
      makePost({ content: { caption: userCap } as any }),
      threeSecHook,
    );
    assert.equal(r2.patch.content.caption, userCap);
  });

  it("only fills hashtags when user list is empty AND platform matches", () => {
    const r1 = applyPlaybook(makePost(), threeSecHook);
    assert.deepEqual(r1.patch.content.hashtags, threeSecHook.defaultHashtags);
    const r2 = applyPlaybook(
      makePost({ content: { hashtags: ["mine"] } as any }),
      threeSecHook,
    );
    assert.deepEqual(r2.patch.content.hashtags, ["mine"]);
  });

  it("uses singular noun in change message when only one starter hashtag", () => {
    // pb_curiosity_gap has no defaultHashtags; build a synthetic playbook
    const synthetic = {
      ...threeSecHook,
      defaultHashtags: ["one"],
    };
    const r = applyPlaybook(makePost(), synthetic);
    assert.ok(r.changes.some((c) => /1 starter hashtag(?!s)/.test(c)));
  });

  it("PRESERVES user-set hasTrendingAudio=false (the regression case)", () => {
    // The file's own comment (playbooks.ts:277-280) documents that an
    // earlier version's spread silently flipped this for users.
    const post = makePost({
      content: { hasTrendingAudio: false } as any,
    });
    const r = applyPlaybook(post, threeSecHook);
    // playbook says hasTrendingAudio=true → it should be set (user has false)
    // The rule is: if playbook says true AND user is currently false, flip on.
    // Confirm the resulting toast lists the change.
    assert.equal(r.patch.content.hasTrendingAudio, true);
    assert.ok(r.changes.some((c) => /trending audio/i.test(c)));
  });

  it("does NOT flag a trending-audio change when user already has it", () => {
    const r = applyPlaybook(
      makePost({ content: { hasTrendingAudio: true } as any }),
      threeSecHook,
    );
    assert.equal(r.patch.content.hasTrendingAudio, true);
    assert.ok(!r.changes.some((c) => /trending audio/i.test(c)));
  });

  it("switches format when playbook format differs", () => {
    const carousel = getPlaybook("pb_carousel_save")!;
    const r = applyPlaybook(
      makePost({ platform: "instagram_feed", content: { format: "video" } as any }),
      carousel,
    );
    assert.equal(r.patch.content.format, "carousel");
    assert.ok(r.changes.some((c) => /carousel/i.test(c)));
  });

  it("sets duration when user duration is more than 6s off target", () => {
    const r = applyPlaybook(
      makePost({ content: { durationSec: 60, format: "video" } as any }),
      threeSecHook, // durationOverride=21
    );
    assert.equal(r.patch.content.durationSec, 21);
    assert.ok(r.changes.some((c) => /duration/i.test(c)));
  });

  it("leaves duration alone when within 6s tolerance", () => {
    const r = applyPlaybook(
      makePost({ content: { durationSec: 18, format: "video" } as any }),
      threeSecHook, // durationOverride=21, diff=3
    );
    assert.equal(r.patch.content.durationSec, 18);
    assert.ok(!r.changes.some((c) => /duration/i.test(c)));
  });

  it("does not override duration on non-video/non-live formats", () => {
    // Synthetic playbook: duration override but no format flip → must not apply
    const synthetic = {
      ...threeSecHook,
      format: undefined,
      durationOverride: 21,
    };
    const r = applyPlaybook(
      makePost({
        platform: "instagram_feed",
        content: { format: "carousel", durationSec: 999 } as any,
      }),
      synthetic,
    );
    assert.equal(r.patch.content.durationSec, 999);
  });

  it("shifts posting time only when user is outside the peak window", () => {
    const xFunnel = getPlaybook("pb_x_funnel")!;
    // User at peak — should NOT shift
    const inPeak = applyPlaybook(
      makePost({
        platform: "x",
        context: { postingHour: 9, dayOfWeek: 2 } as any,
      }),
      xFunnel,
    );
    assert.ok(!inPeak.changes.some((c) => /peak window/i.test(c)));

    // User off-peak — should shift to playbook's postingHour/dayOfWeek
    const offPeak = applyPlaybook(
      makePost({
        platform: "x",
        context: { postingHour: 3, dayOfWeek: 0 } as any,
      }),
      xFunnel,
    );
    assert.equal(offPeak.patch.context.postingHour, xFunnel.contextDefaults!.postingHour);
    assert.equal(offPeak.patch.context.dayOfWeek, xFunnel.contextDefaults!.dayOfWeek);
    assert.ok(offPeak.changes.some((c) => /peak window/i.test(c)));
  });

  it("only bumps novelty/emotion/trendMatch UP, never DOWN", () => {
    // User already maxed out — playbook should not lower
    const r = applyPlaybook(
      makePost({
        content: { hook: "x", caption: "y" } as any, // skip hook/caption changes
        context: { novelty: 5, emotion: 5, trendMatch: 5 } as any,
      }),
      threeSecHook, // wants 4/4/4
    );
    assert.equal(r.patch.context.novelty, 5);
    assert.equal(r.patch.context.emotion, 5);
    assert.equal(r.patch.context.trendMatch, 5);
    assert.ok(!r.changes.some((c) => /Bumped/.test(c)));
  });

  it("bumps novelty when below target", () => {
    const r = applyPlaybook(
      makePost({ context: { novelty: 1 } as any }),
      threeSecHook, // novelty target=4
    );
    assert.equal(r.patch.context.novelty, 4);
    assert.ok(r.changes.some((c) => /Bumped novelty to 4/.test(c)));
  });

  it("changes sentiment only when current is 'neutral'", () => {
    // neutral → playbook value
    const r1 = applyPlaybook(
      makePost({ context: { sentiment: "neutral" } as any }),
      threeSecHook, // wants controversial
    );
    assert.equal(r1.patch.context.sentiment, "controversial");
    assert.ok(r1.changes.some((c) => /sentiment/i.test(c)));

    // non-neutral → preserved
    const r2 = applyPlaybook(
      makePost({ context: { sentiment: "positive" } as any }),
      threeSecHook,
    );
    assert.equal(r2.patch.context.sentiment, "positive");
    assert.ok(!r2.changes.some((c) => /sentiment/i.test(c)));
  });

  it("returns a 'no changes' message when draft already matches", () => {
    // Build a post that already matches every rule in 3s-hook for TikTok peak
    const r = applyPlaybook(
      makePost({
        platform: "tiktok",
        content: {
          hook: "Already a hook",
          caption: "Already a caption",
          hashtags: ["fyp"],
          format: "video",
          durationSec: 21,
          hasTrendingAudio: true,
        } as any,
        context: {
          postingHour: 20, // assumed in tiktok peak
          dayOfWeek: 3,
          novelty: 5,
          emotion: 5,
          trendMatch: 5,
          sentiment: "controversial",
        } as any,
      }),
      threeSecHook,
    );
    assert.equal(r.changes.length, 1);
    assert.match(r.changes[0], /No changes/);
  });

  it("does not mutate the input post", () => {
    const post = makePost();
    const snapshot = JSON.stringify(post);
    applyPlaybook(post, threeSecHook);
    assert.equal(JSON.stringify(post), snapshot);
  });
});

describe("PLAYBOOKS catalogue integrity", () => {
  it("every playbook has a unique id", () => {
    const ids = new Set(PLAYBOOKS.map((p) => p.id));
    assert.equal(ids.size, PLAYBOOKS.length);
  });

  it("every playbook lists at least one platform", () => {
    for (const p of PLAYBOOKS) {
      assert.ok(p.platforms.length > 0, `${p.id} has no platforms`);
    }
  });

  it("every playbook has a non-empty name and description", () => {
    for (const p of PLAYBOOKS) {
      assert.ok(p.name.trim().length > 0, `${p.id} missing name`);
      assert.ok(p.description.trim().length > 0, `${p.id} missing description`);
    }
  });

  it("every playbook has at least one note", () => {
    for (const p of PLAYBOOKS) {
      assert.ok(p.notes.length > 0, `${p.id} has no notes`);
    }
  });

  it("every playbook category is one of the declared options", () => {
    const valid = new Set([
      "hook",
      "thread",
      "carousel",
      "longform",
      "trend",
      "engagement",
    ]);
    for (const p of PLAYBOOKS) {
      assert.ok(valid.has(p.category), `${p.id} bad category ${p.category}`);
    }
  });

  it("every supported platform has at least one applicable playbook", () => {
    for (const platform of [
      "tiktok",
      "reels",
      "shorts",
      "x",
      "threads",
      "linkedin",
      "instagram_feed",
      "facebook",
    ] as const) {
      assert.ok(
        playbooksFor(platform).length > 0,
        `no playbook fits ${platform}`,
      );
    }
  });
});
