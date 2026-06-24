import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { debounce } from "./autosave";

/**
 * Minimal manual fake timer. node:test's `t.mock.timers` API is technically
 * available but its semantics around clearTimeout handles vary across Node
 * versions; a 30-line fake is more readable and equally deterministic.
 */
function makeFakeTimers() {
  type Entry = { id: number; due: number; cb: () => void };
  let now = 0;
  let nextId = 1;
  let queue: Entry[] = [];
  const fakeSetTimeout = ((cb: () => void, ms: number) => {
    const id = nextId++;
    queue.push({ id, due: now + ms, cb });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  const fakeClearTimeout = ((id: ReturnType<typeof setTimeout>) => {
    queue = queue.filter((e) => e.id !== (id as unknown as number));
  }) as typeof clearTimeout;
  const advance = (ms: number) => {
    const target = now + ms;
    while (true) {
      const due = queue
        .filter((e) => e.due <= target)
        .sort((a, b) => a.due - b.due)[0];
      if (!due) break;
      now = due.due;
      queue = queue.filter((e) => e.id !== due.id);
      due.cb();
    }
    now = target;
  };
  return { setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, advance };
}

describe("debounce", () => {
  it("collapses rapid calls within the debounce window into a single call with the final value", () => {
    const timers = makeFakeTimers();
    const calls: string[] = [];
    const d = debounce((v: string) => calls.push(v), 600, {
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });

    // Three rapid edits within 600ms — model: type "a", then "ab", then "abc"
    d.call("a");
    timers.advance(100);
    d.call("ab");
    timers.advance(100);
    d.call("abc");

    // Before the window elapses, nothing has fired.
    timers.advance(599);
    assert.deepEqual(calls, []);

    // Exactly one fire with the final value once the window passes.
    timers.advance(1);
    assert.deepEqual(calls, ["abc"]);
  });

  it("flush() runs the pending call synchronously and clears the timer", () => {
    const timers = makeFakeTimers();
    const calls: string[] = [];
    const d = debounce((v: string) => calls.push(v), 600, {
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });

    d.call("draft");
    d.flush();
    assert.deepEqual(calls, ["draft"]);

    // After flush, advancing the clock does not double-fire.
    timers.advance(10_000);
    assert.deepEqual(calls, ["draft"]);
  });

  it("flush() with nothing pending is a no-op", () => {
    const timers = makeFakeTimers();
    const calls: string[] = [];
    const d = debounce((v: string) => calls.push(v), 600, {
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    d.flush();
    assert.deepEqual(calls, []);
  });

  it("cancel() drops the pending call without firing", () => {
    const timers = makeFakeTimers();
    const calls: string[] = [];
    const d = debounce((v: string) => calls.push(v), 600, {
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    d.call("x");
    d.cancel();
    timers.advance(10_000);
    assert.deepEqual(calls, []);
  });
});
