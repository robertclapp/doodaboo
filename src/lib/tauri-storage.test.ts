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
    // Outside Tauri, vault_save fails but setItem swallows the error silently.
    const origErr = console.error;
    console.error = () => {};
    try {
      const s = createTauriStorage();
      await assert.doesNotReject(
        s.setItem("key", { state: {}, version: 0 } as any),
      );
    } finally {
      console.error = origErr;
    }
  });
});
