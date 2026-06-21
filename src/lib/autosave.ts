/**
 * Tiny debounce primitive used by the task detail page's autosave. Lives in
 * a standalone file (not inline in the React component) so it's unit-testable
 * without a DOM/React harness — see `autosave.test.ts`.
 *
 * Why our own instead of lodash.debounce: zero new dependencies, and we want
 * an explicit `flush()` for the "user closed the tab mid-edit" path that
 * the React component triggers from useEffect cleanup.
 */
export type Debounced<TArgs extends unknown[]> = {
  /** Schedule a call; cancels any prior pending one within the window. */
  call: (...args: TArgs) => void;
  /** Run any pending call immediately and clear the timer. */
  flush: () => void;
  /** Drop any pending call without running it. */
  cancel: () => void;
};

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
  options: { setTimeout?: typeof setTimeout; clearTimeout?: typeof clearTimeout } = {},
): Debounced<TArgs> {
  const setT = options.setTimeout ?? setTimeout;
  const clearT = options.clearTimeout ?? clearTimeout;
  let handle: ReturnType<typeof setTimeout> | null = null;
  let pending: TArgs | null = null;

  const cancel = () => {
    if (handle !== null) {
      clearT(handle);
      handle = null;
    }
    pending = null;
  };

  const flush = () => {
    if (handle !== null) {
      clearT(handle);
      handle = null;
    }
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
    }
  };

  const call = (...args: TArgs) => {
    pending = args;
    if (handle !== null) clearT(handle);
    handle = setT(() => {
      handle = null;
      const args = pending;
      pending = null;
      if (args) fn(...args);
    }, waitMs);
  };

  return { call, flush, cancel };
}
