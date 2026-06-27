import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateHooks,
  HOOK_FAMILIES,
  variantsForPlatform,
} from "./hooks-generator";
import { PLATFORMS } from "./types";

const ALL_PLATFORM_IDS = PLATFORMS.map((p) => p.id);

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

  it("`fitsAll` templates expand to every known platform", () => {
    // Derive the expected set from the canonical PLATFORMS list so adding
    // a platform doesn't require updating a hardcoded count + inline list.
    const v = generateHooks({ subject: "AI agents" });
    const fitsAll = v.filter((x) => x.template.fitsAll);
    assert.ok(fitsAll.length > 0);
    for (const x of fitsAll) {
      assert.deepEqual([...x.fits].sort(), [...ALL_PLATFORM_IDS].sort());
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

  it("facebook variants are non-empty", () => {
    const all = generateHooks({ subject: "business" });
    const fbVariants = variantsForPlatform(all, "facebook");
    assert.ok(fbVariants.length > 0);
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

  it("every entry has a non-empty id and label", () => {
    for (const f of HOOK_FAMILIES) {
      assert.ok(f.id.length > 0);
      assert.ok(f.label.length > 0);
    }
  });

  it("ids are unique", () => {
    const ids = new Set(HOOK_FAMILIES.map((f) => f.id));
    assert.equal(ids.size, HOOK_FAMILIES.length);
  });

  it("has exactly 7 families", () => {
    assert.equal(HOOK_FAMILIES.length, 7);
  });
});

describe("variantsForPlatform subset property", () => {
  it("any platform's variants are a subset of 'all' variants", () => {
    const all = generateHooks({ subject: "ai" });
    const allIds = new Set(all.map((v) => v.id));
    for (const p of [
      "tiktok",
      "x",
      "linkedin",
      "instagram_feed",
      "facebook",
    ] as const) {
      const sub = variantsForPlatform(all, p);
      for (const v of sub) {
        assert.ok(allIds.has(v.id), `${p}: ${v.id} not in 'all'`);
      }
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

  it("list-n-things uses '3' (pick index 0)", () => {
    const v = generateHooks({ subject: "productivity" }).find(
      (x) => x.template.id === "list-n-things",
    );
    assert.ok(v);
    assert.match(v!.hook, /^3 /);
  });

  it("list-n-things-2 uses '5' (pick index 1)", () => {
    const v = generateHooks({ subject: "productivity" }).find(
      (x) => x.template.id === "list-n-things-2",
    );
    assert.ok(v);
    assert.match(v!.hook, /^5 /);
  });

  it("rules uses '7' (pick index 2)", () => {
    const v = generateHooks({ subject: "productivity" }).find(
      (x) => x.template.id === "rules",
    );
    assert.ok(v);
    assert.match(v!.hook, /^7 /);
  });

  it("'x-but-y' capitalizes first char of subject", () => {
    const v = generateHooks({ subject: "boring meetings" }).find(
      (x) => x.template.id === "x-but-y",
    );
    assert.ok(v);
    // capitalize("boring meetings") = "Boring meetings"
    assert.match(v!.hook, /^Boring meetings/);
  });

  it("'not-what-you-think' capitalizes subject", () => {
    const v = generateHooks({ subject: "remote work" }).find(
      (x) => x.template.id === "not-what-you-think",
    );
    assert.ok(v);
    assert.match(v!.hook, /^Remote work isn't what you think/);
  });
});
