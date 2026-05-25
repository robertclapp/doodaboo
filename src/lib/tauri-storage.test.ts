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
