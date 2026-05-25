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

  it("returns false when window.__TAURI__ is 0 (falsy)", () => {
    (globalThis as any).window = { __TAURI__: 0 };
    try {
      assert.equal(isTauri(), false);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns false when window.__TAURI_INTERNALS__ is false", () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: false };
    try {
      assert.equal(isTauri(), false);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns true when __TAURI_INTERNALS__ is a non-null object", () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: { version: "2.0" } };
    try {
      assert.equal(isTauri(), true);
    } finally {
      delete (globalThis as any).window;
    }
  });
});

describe("createTauriStorage", () => {
  it("returns an object with getItem, setItem, removeItem methods", () => {
    const storage = createTauriStorage();
    assert.equal(typeof storage.getItem, "function");
    assert.equal(typeof storage.setItem, "function");
    assert.equal(typeof storage.removeItem, "function");
  });

  it("removeItem is a no-op (returns a resolved promise)", async () => {
    const storage = createTauriStorage();
    // removeItem is intentionally a no-op; it should not throw
    await assert.doesNotReject(() => storage.removeItem("any-key"));
  });

  it("getItem returns null when @tauri-apps/api is not available (non-Tauri env)", async () => {
    // In a Node.js test environment, @tauri-apps/api will fail to import.
    // The catch block should return null gracefully.
    const storage = createTauriStorage();
    const result = await storage.getItem("workspace");
    assert.equal(result, null);
  });

  it("setItem does not throw when @tauri-apps/api is not available", async () => {
    const storage = createTauriStorage();
    await assert.doesNotReject(() =>
      storage.setItem("workspace", { state: {}, version: 0 }),
    );
  });
});
