import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseConvexUrl } from "./backend";

describe("parseConvexUrl", () => {
  it("unset or blank means local-first with no error", () => {
    assert.deepEqual(parseConvexUrl(undefined), { url: null });
    assert.deepEqual(parseConvexUrl(""), { url: null });
    assert.deepEqual(parseConvexUrl("   "), { url: null });
  });

  it("accepts a deployment URL and normalizes it", () => {
    assert.deepEqual(parseConvexUrl("https://happy-otter-123.convex.cloud"), {
      url: "https://happy-otter-123.convex.cloud",
    });
    assert.deepEqual(parseConvexUrl(" https://happy-otter-123.convex.cloud/ "), {
      url: "https://happy-otter-123.convex.cloud",
    });
    // Self-hosted deployments are plain http(s) origins too.
    assert.equal(parseConvexUrl("http://127.0.0.1:3210").url, "http://127.0.0.1:3210");
  });

  it("rejects what the Convex client would refuse, with a readable reason", () => {
    const bad = parseConvexUrl("happy-otter-123.convex.cloud");
    assert.equal(bad.url, null);
    assert.match(bad.error ?? "", /not a valid URL/);

    const site = parseConvexUrl("https://happy-otter-123.convex.site");
    assert.equal(site.url, null);
    assert.match(site.error ?? "", /convex\.site/);

    const scheme = parseConvexUrl("wss://happy-otter-123.convex.cloud");
    assert.equal(scheme.url, null);
    assert.match(scheme.error ?? "", /https/);
  });
});
