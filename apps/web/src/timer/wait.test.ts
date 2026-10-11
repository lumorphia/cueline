import { describe, expect, it } from "vitest";
import { createWaiter } from "./wait.ts";

// 偽の setTimeout。offset で早く (負) / 遅く (正) 起きる
function fakeTimers(offsets: number[] = []) {
  let now = 0;
  let timers: { id: number; at: number; fn: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers = [...timers, { id, at: now + ms + (offsets.shift() ?? 0), fn }];
      return id;
    },
    clearTimeout: (id: number) => {
      timers = timers.filter((t) => t.id !== id);
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a.at - b.at)[0];
        if (!next || next.at > end) break;
        timers = timers.filter((t) => t.id !== next.id);
        now = Math.max(now, next.at);
        next.fn();
      }
      now = end;
    },
  };
}

describe("createWaiter", () => {
  it("calls back once the delay has passed", () => {
    const timers = fakeTimers();
    const fired: number[] = [];
    createWaiter(timers).set(1, 100, () => fired.push(timers.now()));
    timers.advance(150);
    expect(fired).toEqual([100]);
  });

  it("waits again instead of calling back when the timer wakes early", () => {
    const timers = fakeTimers([-30]);
    const fired: number[] = [];
    createWaiter(timers).set(1, 100, () => fired.push(timers.now()));
    timers.advance(80);
    expect(fired).toEqual([]);
    timers.advance(70);
    expect(fired).toEqual([100]);
  });

  it("does not call back after being cleared", () => {
    const timers = fakeTimers([-30]);
    const fired: number[] = [];
    const waiter = createWaiter(timers);
    waiter.set(1, 100, () => fired.push(timers.now()));
    timers.advance(80);
    waiter.clear(1);
    timers.advance(100);
    expect(fired).toEqual([]);
  });
});
