"use client";

import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { WorkspaceState } from "./mutations";

/**
 * Tauri-aware persistence adapter.
 *
 * When the app runs inside a Tauri webview, `window.__TAURI_INTERNALS__`
 * is present before any user JS executes. In that case the zustand
 * store routes every load/save through Rust commands defined in
 * `src-tauri/src/lib.rs` (vault_load / vault_save), so the desktop app
 * reads and writes the same vault directory the CLI does — no
 * localStorage involved.
 *
 * On the web (or in SSR), `isTauri()` is false and the store falls back
 * to localStorage. The browser bundle never imports `@tauri-apps/api`
 * unless Tauri is actually detected at runtime, so there's no weight
 * penalty for web users.
 */

interface TauriRuntime {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
}

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as TauriRuntime;
  return Boolean(w.__TAURI_INTERNALS__ ?? w.__TAURI__);
}

type Invoke = <T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<T>;

let invokeCache: Invoke | null = null;
async function getInvoke(): Promise<Invoke> {
  if (invokeCache) return invokeCache;
  const mod = (await import("@tauri-apps/api/core")) as { invoke: Invoke };
  invokeCache = mod.invoke;
  return invokeCache;
}

/**
 * Implements zustand's `PersistStorage<unknown>` directly so the
 * desktop vault file is the bare WorkspaceState — byte-for-byte
 * identical to what the CLI writes. Returning a `PersistStorage`
 * sidesteps `createJSONStorage`'s JSON.parse/stringify wrapper, which
 * would otherwise force us to wrap the state in a redundant string
 * envelope before handing it to Rust.
 */
export function createTauriStorage(): PersistStorage<unknown> {
  return {
    async getItem(): Promise<StorageValue<unknown> | null> {
      try {
        const invoke = await getInvoke();
        const state = await invoke<WorkspaceState | null>("vault_load");
        if (!state) return null;
        return { state, version: 0 };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[doodaboo] tauri vault_load failed", err);
        return null;
      }
    },
    async setItem(_name: string, value: StorageValue<unknown>): Promise<void> {
      try {
        const invoke = await getInvoke();
        await invoke("vault_save", { state: value.state });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[doodaboo] tauri vault_save failed", err);
      }
    },
    async removeItem(): Promise<void> {
      // Intentional no-op: clearing the desktop vault is an explicit
      // user action surfaced in Settings → Danger zone, not a side
      // effect of resetting persisted state.
    },
  };
}
