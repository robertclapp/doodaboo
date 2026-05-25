import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTauri } from "./tauri-storage";

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
});

// ── isTauri additional edge cases ────────────────────────────────────────

describe("isTauri — additional edge cases", () => {
  it("returns false when window.__TAURI_INTERNALS__ is explicitly undefined", () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: undefined, __TAURI__: undefined };
    try {
      assert.equal(isTauri(), false);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns false when window.__TAURI_INTERNALS__ is null (Boolean(null)===false)", () => {
    // Boolean(null) === false, so null on __TAURI_INTERNALS__ with no __TAURI__ returns false
    (globalThis as any).window = { __TAURI_INTERNALS__: null };
    try {
      assert.equal(isTauri(), false);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns true when __TAURI_INTERNALS__ is a non-empty object", () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: { version: "1.0" } };
    try {
      assert.equal(isTauri(), true);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("returns true when __TAURI__ is a non-empty string (legacy truthy value)", () => {
    (globalThis as any).window = { __TAURI__: "1.0" };
    try {
      assert.equal(isTauri(), true);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("is stable across multiple calls without window (idempotent)", () => {
    assert.equal(isTauri(), false);
    assert.equal(isTauri(), false);
  });
});
