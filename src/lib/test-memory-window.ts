/**
 * Test-only: give modules that persist to `window.localStorage` (the zustand
 * store) an in-memory one under node:test. Import it before anything that
 * imports src/lib/store.ts — zustand resolves its storage when the store is
 * created.
 */
const memory = new Map<string, string>();
const storage = {
  get length() {
    return memory.size;
  },
  key: (i: number) => [...memory.keys()][i] ?? null,
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
};
const g = globalThis as unknown as { window?: { localStorage: typeof storage } };
if (!g.window) g.window = { localStorage: storage };
export {};
