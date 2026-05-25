import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateHooks,
  HOOK_FAMILIES,
  variantsForPlatform,
} from "./hooks-generator";

describe("generateHooks", () => {
  it("returns [] for empty or whitespace-only subject", () => {
    assert.deepEqual(generateHooks({ subject: "" }), []);
    assert.deepEqual(generateHooks({ subject: "   " }), []);
  });

  it("is deterministic: same input → same variants in same order", () => {
    const a = generateHooks({ subject: "design systems" });
    const b = generateHooks({ subject: "design systems" });
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i].id, b[i].id);
      assert.equal(a[i].hook, b[i].hook);
    }
  });

  it("returns at least one variant for a non-empty subject", () => {
    const v = generateHooks({ subject: "AI agents" });
    assert.ok(v.length > 0);
  });

  it("every variant has a non-empty hook string", () => {
    const v = generateHooks({ subject: "AI agents" });
    for (const x of v) {
      assert.ok(x.hook.length > 0, `empty hook for ${x.id}`);
    }
  });

  it("`fitsAll` templates expand to all 8 platforms", () => {
    const v = generateHooks({ subject: "AI agents" });
    const fitsAll = v.filter((x) => x.template.fitsAll);
    assert.ok(fitsAll.length > 0);
    for (const x of fitsAll) {
      assert.equal(x.fits.length, 8);
      for (const p of [
        "tiktok",
        "reels",
        "shorts",
        "x",
        "threads",
        "linkedin",
        "instagram_feed",
        "facebook",
      ]) {
        assert.ok(x.fits.includes(p as any), `missing ${p} in ${x.id}`);
      }
    }
  });

  it("non-fitsAll variants carry only the template's listed platforms", () => {
    const v = generateHooks({ subject: "AI agents" });
    const limited = v.filter((x) => !x.template.fitsAll);
    for (const x of limited) {
      const expected = x.template.fits ?? [];
      assert.deepEqual(x.fits.slice().sort(), expected.slice().sort());
    }
  });

  it("variant id embeds a slugified subject (lowercased, hyphenated)", () => {
    const v = generateHooks({ subject: "  Design Systems!!  " });
    for (const x of v) {
      assert.ok(
        /design-systems/.test(x.id),
        `expected design-systems in ${x.id}`,
      );
      // Must not contain uppercase or punctuation
      assert.equal(x.id, x.id.toLowerCase());
    }
  });

  it("subject slug caps at 24 chars in the id", () => {
    const longSubject = "this is a really long subject line that keeps going";
    const v = generateHooks({ subject: longSubject });
    // id is `${template.id}_${slug}` where slug max length = 24.
    // We assert the slug portion length explicitly.
    for (const x of v) {
      const slug = x.id.slice(x.template.id.length + 1);
      assert.ok(slug.length <= 24, `slug too long: ${slug}`);
    }
  });

  it("interpolates audience into the contrarian template", () => {
    const withAud = generateHooks({
      subject: "pricing",
      audience: "founders",
    }).find((x) => x.template.id === "everyone-wrong");
    assert.ok(withAud);
    assert.match(withAud!.hook, /founders/);

    const withoutAud = generateHooks({ subject: "pricing" }).find(
      (x) => x.template.id === "everyone-wrong",
    );
    assert.ok(withoutAud);
    assert.match(withoutAud!.hook, /people/); // default fallback
  });

  it("every variant id is unique within a generation", () => {
    const v = generateHooks({ subject: "ai" });
    const ids = new Set(v.map((x) => x.id));
    assert.equal(ids.size, v.length);
  });
});

describe("variantsForPlatform", () => {
  it("returns all variants when platform=all", () => {
    const v = generateHooks({ subject: "ai" });
    assert.equal(variantsForPlatform(v, "all").length, v.length);
  });

  it("filters to variants that include the platform", () => {
    const v = generateHooks({ subject: "ai" });
    const tt = variantsForPlatform(v, "tiktok");
    assert.ok(tt.length > 0);
    for (const x of tt) {
      assert.ok(x.fits.includes("tiktok"));
    }
  });

  it("excludes variants whose template does not target the platform", () => {
    // "everyone-wrong" template targets x/threads/linkedin/facebook only.
    const v = generateHooks({ subject: "ai" });
    const tt = variantsForPlatform(v, "tiktok");
    assert.ok(!tt.find((x) => x.template.id === "everyone-wrong"));
  });
});

describe("HOOK_FAMILIES", () => {
  it("covers every family used by some template", () => {
    const families = new Set(HOOK_FAMILIES.map((f) => f.id));
    const used = new Set(
      generateHooks({ subject: "x" }).map((v) => v.template.family),
    );
    for (const f of used) {
      assert.ok(families.has(f), `family ${f} missing from HOOK_FAMILIES`);
    }
  });
});

describe("template content sanity", () => {
  it("'stop-x' embeds the subject after 'Stop'", () => {
    const v = generateHooks({ subject: "doing X" }).find(
      (x) => x.template.id === "stop-x",
    );
    assert.ok(v);
    assert.match(v!.hook, /^Stop doing X\./);
  });

  it("'tried-for-x-days' mentions '30 days'", () => {
    const v = generateHooks({ subject: "ai agents" }).find(
      (x) => x.template.id === "tried-for-x-days",
    );
    assert.ok(v);
    assert.match(v!.hook, /30 days/);
  });

  it("'no-one-tells' uses the 'What nobody tells you about' framing", () => {
    const v = generateHooks({ subject: "ai agents" }).find(
      (x) => x.template.id === "no-one-tells",
    );
    assert.ok(v);
    assert.match(v!.hook, /What nobody tells you about ai agents/);
  });

  it("'in-x-seconds' (TikTok-native) only fits short-form video platforms", () => {
    const v = generateHooks({ subject: "ai" }).find(
      (x) => x.template.id === "in-x-seconds",
    );
    assert.ok(v);
    assert.deepEqual(
      v!.fits.slice().sort(),
      ["reels", "shorts", "tiktok"].sort(),
    );
  });
});

// ── Additional template content coverage ─────────────────────────────────

describe("template content — remaining templates", () => {
  it("'before-after' embeds the subject and mentions 'same effort'", () => {
    const v = generateHooks({ subject: "ai workflows" }).find(
      (x) => x.template.id === "before-after",
    );
    assert.ok(v);
    assert.match(v!.hook, /ai workflows/);
    assert.match(v!.hook, /same effort/);
  });

  it("'before-after' fits instagram_feed, tiktok, reels, shorts", () => {
    const v = generateHooks({ subject: "ai" }).find(
      (x) => x.template.id === "before-after",
    );
    assert.ok(v);
    assert.deepEqual(
      v!.fits.slice().sort(),
      ["instagram_feed", "reels", "shorts", "tiktok"].sort(),
    );
  });

  it("'x-but-y' capitalizes first letter of subject", () => {
    const v = generateHooks({ subject: "react" }).find(
      (x) => x.template.id === "x-but-y",
    );
    assert.ok(v);
    assert.match(v!.hook, /^React,/);
  });

  it("'i-was-wrong' embeds the subject and adds evidence promise", () => {
    const v = generateHooks({ subject: "TDD" }).find(
      (x) => x.template.id === "i-was-wrong",
    );
    assert.ok(v);
    assert.match(v!.hook, /I was wrong about TDD/);
    assert.match(v!.hook, /receipt/);
  });

  it("'i-was-wrong' fits only x, threads, linkedin", () => {
    const v = generateHooks({ subject: "ai" }).find(
      (x) => x.template.id === "i-was-wrong",
    );
    assert.ok(v);
    assert.deepEqual(v!.fits.slice().sort(), ["linkedin", "threads", "x"].sort());
  });

  it("'the-x-that' embeds the subject", () => {
    const v = generateHooks({ subject: "systems thinking" }).find(
      (x) => x.template.id === "the-x-that",
    );
    assert.ok(v);
    assert.match(v!.hook, /systems thinking/);
    assert.match(v!.hook, /framework/);
  });

  it("'you-think' confronts the reader about the subject", () => {
    const v = generateHooks({ subject: "pricing" }).find(
      (x) => x.template.id === "you-think",
    );
    assert.ok(v);
    assert.match(v!.hook, /You think you understand pricing. You don't./);
  });

  it("'would-you' asks a direct question referencing subject", () => {
    const v = generateHooks({ subject: "auth" }).find(
      (x) => x.template.id === "would-you",
    );
    assert.ok(v);
    assert.match(v!.hook, /Would you ship/);
    assert.match(v!.hook, /I almost did/);
  });

  it("'not-what-you-think' capitalizes subject and opens a mystery loop", () => {
    const v = generateHooks({ subject: "recursion" }).find(
      (x) => x.template.id === "not-what-you-think",
    );
    assert.ok(v);
    assert.match(v!.hook, /^Recursion isn't what you think/);
  });

  it("'list-n-things' uses the number 3 (pick index 0)", () => {
    const v = generateHooks({ subject: "habits" }).find(
      (x) => x.template.id === "list-n-things",
    );
    assert.ok(v);
    assert.match(v!.hook, /^3 habits/);
  });

  it("'list-n-things-2' uses the number 5 (pick index 1)", () => {
    const v = generateHooks({ subject: "habits" }).find(
      (x) => x.template.id === "list-n-things-2",
    );
    assert.ok(v);
    assert.match(v!.hook, /^5 habits/);
  });

  it("'rules' uses the number 7 (pick index 2)", () => {
    const v = generateHooks({ subject: "writing" }).find(
      (x) => x.template.id === "rules",
    );
    assert.ok(v);
    assert.match(v!.hook, /^7 rules for writing/);
  });

  it("'why-x' includes the subject and a fix tease", () => {
    const v = generateHooks({ subject: "CSS specificity" }).find(
      (x) => x.template.id === "why-x",
    );
    assert.ok(v);
    assert.match(v!.hook, /CSS specificity keeps breaking/);
    assert.match(v!.hook, /nobody ships/);
  });
});

describe("generateHooks — total variant count", () => {
  it("returns exactly as many variants as there are templates", () => {
    const v = generateHooks({ subject: "test subject" });
    // 16 templates defined in TEMPLATES
    assert.equal(v.length, 16);
  });
});

describe("variantsForPlatform — platform with no non-fitsAll matches", () => {
  it("facebook: only fitsAll templates and explicit facebook fits", () => {
    const v = generateHooks({ subject: "ai" });
    const fb = variantsForPlatform(v, "facebook");
    assert.ok(fb.length > 0);
    for (const x of fb) {
      assert.ok(
        x.fits.includes("facebook"),
        `variant ${x.id} does not include facebook`,
      );
    }
  });

  it("the 'everyone-wrong' template appears in facebook results", () => {
    const v = generateHooks({ subject: "ai" });
    const fb = variantsForPlatform(v, "facebook");
    assert.ok(fb.find((x) => x.template.id === "everyone-wrong"));
  });
});
