// テストのための偽の時計とタイマー (docs/design/03-engine.md)。時間を好きなだけ進め、張られたタイマーを時刻順に起こす。
// wakeOffset で「タイマーが何 ms 遅れて (負なら早く) 起きるか」を決められる
import type { Clock, Timer } from "./engine.ts";

type Pending = { id: number; at: number; callback: () => void };

export type FakeTime = {
  clock: Clock;
  timer: Timer;
  /** 時計を ms 進め、その間に起きるタイマーを時刻順に起こす */
  advance(ms: number): void;
  /** タイマーを起こさずに時計だけ進める (スリープやタブの停止) */
  jump(ms: number): void;
  /** 張られているタイマーの数 */
  pending(): number;
};

export function createFakeTime(wakeOffset: () => number = () => 0, start = 1000): FakeTime {
  let now = start;
  let nextId = 1;
  let timers: Pending[] = [];

  const timer: Timer = {
    set(callback, delayMs) {
      const id = nextId++;
      timers = [...timers, { id, at: now + Math.max(0, delayMs + wakeOffset()), callback }];
      return id;
    },
    clear(handle) {
      timers = timers.filter((t) => t.id !== handle);
    },
  };

  function advance(ms: number) {
    const end = now + ms;
    for (let woke = 0; ; woke++) {
      // 同じ時刻に張り直し続ける誤りで、テストが止まらなくならないように
      if (woke > 1_000_000) throw new Error("タイマーが同じ時刻で張り直され続けている");
      const next = [...timers].sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!next || next.at > end) break;
      timers = timers.filter((t) => t.id !== next.id);
      now = Math.max(now, next.at);
      next.callback();
    }
    now = end;
  }

  return {
    clock: { now: () => now },
    timer,
    advance,
    jump: (ms) => {
      now += ms;
    },
    pending: () => timers.length,
  };
}
