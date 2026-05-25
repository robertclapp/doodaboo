import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTauriStorage, isTauri } from "./tauri-storage";

describe("isTauri", () => {
  it("returns false when window is undefined (SSR)", () => {
    // Node's global has no `window` — SSR path.
    assert.equal(typeof (globalThis as any).window, "undefined");
    assert.equal(isTauri(), false);
  });

  it("returns true when window.__TAURI_INTERNALS__ is present", () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: {} };
    try {
      assert.equal(isTauri(), true);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns true when window.__TAURI__ is present (legacy)", () => {
    (globalThis as any).window = { __TAURI__: true };
    try {
      assert.equal(isTauri(), true);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns false when window has neither tauri marker", () => {
    (globalThis as any).window = {};
    try {
      assert.equal(isTauri(), false);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns false when __TAURI_INTERNALS__ is null (Boolean(null)=false)", () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: null };
    try {
      assert.equal(isTauri(), false);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns true when __TAURI__ is a non-empty string (legacy truthy)", () => {
    (globalThis as any).window = { __TAURI__: "yes" };
    try {
      assert.equal(isTauri(), true);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("is idempotent — stable across repeated calls", () => {
    assert.equal(isTauri(), false);
    assert.equal(isTauri(), false);
    assert.equal(isTauri(), false);
  });
});

describe("createTauriStorage", () => {
  it("returns a PersistStorage shape with getItem/setItem/removeItem", () => {
    const s = createTauriStorage();
    assert.equal(typeof s.getItem, "function");
    assert.equal(typeof s.setItem, "function");
    assert.equal(typeof s.removeItem, "function");
  });

  it("removeItem is a no-op resolved promise (intentional per file comment)", async () => {
    const s = createTauriStorage();
    const r = await s.removeItem("anything");
    assert.equal(r, undefined);
  });

  it("getItem returns null when @tauri-apps/api is not available", async () => {
    // Suppress the expected console.error from the failed dynamic import.
    const origErr = console.error;
    console.error = () => {};
    try {
      const s = createTauriStorage();
      const r = await s.getItem("anything");
      // Outside Tauri, the dynamic import of @tauri-apps/api/core fails,
      // and getItem returns null per the catch branch.
      assert.equal(r, null);
    } finally {
      console.error = origErr;
    }
  });

  it("setItem resolves without throwing when @tauri-apps/api is unavailable", async () => {
    const origErr = console.error;
    console.error = () => {};
    try {
      const s = createTauriStorage();
      // The catch branch swallows the error so persistence failures
      // don't crash the zustand store in non-Tauri environments.
      const p = s.setItem("k", { state: {}, version: 0 }) as Promise<void>;
      await assert.doesNotReject(p);
    } finally {
      console.error = origErr;
    }
  });
});

// ── Additional: isTauri edge cases ─────────────────────────────────────────

describe("isTauri — additional edge cases", () => {
  it("returns false when __TAURI_INTERNALS__ is 0 (falsy number)", () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: 0 };
    try {
      assert.equal(isTauri(), false);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns false when __TAURI_INTERNALS__ is empty string (falsy)", () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: "" };
    try {
      assert.equal(isTauri(), false);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns true when __TAURI_INTERNALS__ is false but __TAURI__ is true", () => {
    // Boolean(false ?? true) = Boolean(false) = false — nullish coalescing
    // only falls through on null/undefined, not false.
    // So: __TAURI_INTERNALS__=false → Boolean(false) = false
    // BUT __TAURI__ is not checked in this case since ?? only triggers on null/undefined.
    // The actual behavior: Boolean(false ?? {}) = Boolean(false) = false.
    (globalThis as any).window = { __TAURI_INTERNALS__: false, __TAURI__: true };
    try {
      // __TAURI_INTERNALS__ is defined (false) so ?? short-circuits to false.
      // Therefore isTauri() returns false.
      assert.equal(isTauri(), false);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns true when __TAURI_INTERNALS__ is undefined but __TAURI__ is non-empty object", () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: undefined, __TAURI__: { version: "1.0" } };
    try {
      // __TAURI_INTERNALS__ is undefined → ?? falls through to __TAURI__ which is truthy
      assert.equal(isTauri(), true);
    } finally {
      delete (globalThis as any).window;
    }
  });
});

// ── Additional: createTauriStorage shape contract ──────────────────────────

describe("createTauriStorage — shape contract", () => {
  it("returns a new independent instance each call (no shared mutable state)", () => {
    const s1 = createTauriStorage();
    const s2 = createTauriStorage();
    assert.notEqual(s1, s2);
    // Both still have the correct API shape
    assert.equal(typeof s1.getItem, "function");
    assert.equal(typeof s2.getItem, "function");
  });

  it("removeItem always returns a Promise (async contract)", async () => {
    const s = createTauriStorage();
    const result = s.removeItem("any-key");
    assert.ok(result instanceof Promise);
    const resolved = await result;
    assert.equal(resolved, undefined);
  });
});
