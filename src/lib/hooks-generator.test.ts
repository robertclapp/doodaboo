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

  it("has a non-empty label for every family", () => {
    for (const f of HOOK_FAMILIES) {
      assert.ok(f.label.length > 0, `empty label for family ${f.id}`);
    }
  });
});

// ── Additional: per-template platform filtering ───────────────────────────

describe("generateHooks — per-template platform filtering", () => {
  it("'before-after' only fits instagram_feed, tiktok, reels, shorts (not linkedin)", () => {
    const v = generateHooks({ subject: "fitness" });
    const ba = v.find((x) => x.template.id === "before-after")!;
    assert.ok(ba, "before-after template not found");
    assert.ok(ba.fits.includes("instagram_feed"));
    assert.ok(ba.fits.includes("tiktok"));
    assert.ok(ba.fits.includes("reels"));
    assert.ok(ba.fits.includes("shorts"));
    assert.ok(!ba.fits.includes("linkedin"));
    assert.ok(!ba.fits.includes("x"));
  });

  it("'in-x-seconds' only fits tiktok, reels, shorts (short-form video platforms)", () => {
    const v = generateHooks({ subject: "css" });
    const ixs = v.find((x) => x.template.id === "in-x-seconds")!;
    assert.ok(ixs, "in-x-seconds template not found");
    for (const p of ["tiktok", "reels", "shorts"]) {
      assert.ok(ixs.fits.includes(p as any), `missing ${p}`);
    }
    assert.ok(!ixs.fits.includes("linkedin"));
    assert.ok(!ixs.fits.includes("facebook"));
    assert.ok(!ixs.fits.includes("x"));
  });

  it("'list-n-things-2' does not include tiktok or reels", () => {
    const v = generateHooks({ subject: "startup lessons" });
    const l2 = v.find((x) => x.template.id === "list-n-things-2")!;
    assert.ok(l2, "list-n-things-2 template not found");
    assert.ok(!l2.fits.includes("tiktok"));
    assert.ok(!l2.fits.includes("reels"));
    assert.ok(l2.fits.includes("linkedin"));
    assert.ok(l2.fits.includes("x"));
  });

  it("'you-think' only fits x, threads, linkedin (no video platforms)", () => {
    const v = generateHooks({ subject: "ai" });
    const yt = v.find((x) => x.template.id === "you-think")!;
    assert.ok(yt, "you-think template not found");
    for (const p of ["x", "threads", "linkedin"]) {
      assert.ok(yt.fits.includes(p as any), `missing ${p}`);
    }
    assert.ok(!yt.fits.includes("tiktok"));
    assert.ok(!yt.fits.includes("reels"));
    assert.ok(!yt.fits.includes("instagram_feed"));
  });

  it("'i-was-wrong' fits x, threads, linkedin (long-form platforms)", () => {
    const v = generateHooks({ subject: "remote work" });
    const iw = v.find((x) => x.template.id === "i-was-wrong")!;
    assert.ok(iw, "i-was-wrong template not found");
    assert.ok(iw.fits.includes("x"));
    assert.ok(iw.fits.includes("threads"));
    assert.ok(iw.fits.includes("linkedin"));
    // Contains the 'receipt' promise in the hook
    assert.match(iw.hook, /receipt/);
  });

  it("'rules' fits x, threads, linkedin, instagram_feed but not tiktok", () => {
    const v = generateHooks({ subject: "marketing" });
    const rules = v.find((x) => x.template.id === "rules")!;
    assert.ok(rules, "rules template not found");
    assert.ok(rules.fits.includes("linkedin"));
    assert.ok(rules.fits.includes("instagram_feed"));
    assert.ok(!rules.fits.includes("tiktok"));
    assert.ok(!rules.fits.includes("shorts"));
  });

  it("'x-but-y' fits short-form + text platforms but not instagram_feed or linkedin", () => {
    const v = generateHooks({ subject: "javascript" });
    const xby = v.find((x) => x.template.id === "x-but-y")!;
    assert.ok(xby, "x-but-y template not found");
    assert.ok(xby.fits.includes("tiktok"));
    assert.ok(xby.fits.includes("reels"));
    assert.ok(xby.fits.includes("shorts"));
    assert.ok(xby.fits.includes("x"));
    assert.ok(xby.fits.includes("threads"));
    assert.ok(!xby.fits.includes("instagram_feed"));
    assert.ok(!xby.fits.includes("linkedin"));
  });
});

describe("generateHooks — hook content correctness", () => {
  it("'stop-x' hook embeds the subject verbatim", () => {
    const v = generateHooks({ subject: "multitasking" });
    const stop = v.find((x) => x.template.id === "stop-x")!;
    assert.ok(stop);
    assert.match(stop.hook, /multitasking/);
    assert.match(stop.hook, /Do this instead/);
  });

  it("'tried-for-x-days' includes '30 days' in the hook", () => {
    const v = generateHooks({ subject: "meditation" });
    const tried = v.find((x) => x.template.id === "tried-for-x-days")!;
    assert.ok(tried);
    assert.match(tried.hook, /30 days/);
  });

  it("'no-one-tells' produces a 'What nobody tells you about' hook", () => {
    const v = generateHooks({ subject: "compounding" });
    const not = v.find((x) => x.template.id === "no-one-tells")!;
    assert.ok(not);
    assert.match(not.hook, /What nobody tells you about/);
  });

  it("'not-what-you-think' capitalizes the subject", () => {
    const v = generateHooks({ subject: "react" });
    const nwyt = v.find((x) => x.template.id === "not-what-you-think")!;
    assert.ok(nwyt);
    // capitalize() uppercases first char
    assert.match(nwyt.hook, /^React/);
  });

  it("'in-x-seconds' capitalizes the subject and appends 'in 10 seconds'", () => {
    const v = generateHooks({ subject: "docker" });
    const ixs = v.find((x) => x.template.id === "in-x-seconds")!;
    assert.ok(ixs);
    assert.match(ixs.hook, /^Docker/);
    assert.match(ixs.hook, /10 seconds/);
  });
});

describe("variantsForPlatform — additional platforms", () => {
  it("returns results for facebook platform", () => {
    const v = generateHooks({ subject: "ai" });
    const fb = variantsForPlatform(v, "facebook");
    assert.ok(fb.length > 0);
    for (const x of fb) {
      assert.ok(x.fits.includes("facebook"));
    }
  });

  it("returns results for shorts platform", () => {
    const v = generateHooks({ subject: "python" });
    const sh = variantsForPlatform(v, "shorts");
    assert.ok(sh.length > 0);
    for (const x of sh) {
      assert.ok(x.fits.includes("shorts"));
    }
  });

  it("variantsForPlatform preserves template reference", () => {
    const v = generateHooks({ subject: "ai" });
    const filtered = variantsForPlatform(v, "linkedin");
    for (const x of filtered) {
      assert.ok(x.template, "template reference must be present after filtering");
      assert.ok(x.template.id.length > 0);
    }
  });
});
