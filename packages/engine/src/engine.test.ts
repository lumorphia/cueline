import { buildTimeline, parseScript } from "@timeline-call/script";
import type { Timeline } from "@timeline-call/script";
import { describe, expect, it } from "vitest";
import { createEngine } from "./engine.ts";
import type { EngineOptions, EngineState, RewindPolicy } from "./engine.ts";
import { createFakeTime } from "./fake-time.ts";

// --- スクリプトを組み立てる ---

type Obj = Record<string, unknown>;
const note = (before = 0, extra: Obj = {}): Obj => ({
  type: "speech",
  text: "テスト",
  before,
  ...extra,
});
const ev = (id: string, at: number, notifications: Obj[] = [note()]): Obj => ({
  id,
  at,
  name: `テスト_${id}`,
  notifications,
});
const abs = (id: string, at: number, events: Obj[]): Obj => ({
  id,
  name: `テスト_${id}`,
  start: { type: "absolute", at },
  events,
});
const man = (id: string, events: Obj[]): Obj => ({
  id,
  name: `テスト_${id}`,
  start: { type: "manual" },
  events,
});

function timelineOf(...phases: Obj[]): Timeline {
  const result = parseScript(
    JSON.stringify({
      version: 1,
      metadata: { id: "test-boss", name: "テスト_ボス", language: "ja-JP" },
      phases,
    }),
    { format: "json" },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return buildTimeline(result.script);
}

// A 10 秒、B 20 秒、C 30 秒 (設計書 03 の例)
const abc = () => timelineOf(abs("p1", 0, [ev("a", 10), ev("b", 20), ev("c", 30)]));

type Setup = Partial<Pick<EngineOptions, "lookaheadMs" | "lateToleranceMs" | "rewindPolicy">> & {
  wakeOffset?: () => number;
};

function setup(timeline: Timeline, options: Setup = {}) {
  const time = createFakeTime(options.wakeOffset);
  const fires: { id: string; logical: number; mono: number; dueAtMono: number }[] = [];
  const missed: { ids: string[]; lateMs: number }[] = [];
  const states: EngineState[] = [];
  const engine = createEngine({
    timeline,
    clock: time.clock,
    timer: time.timer,
    lookaheadMs: options.lookaheadMs ?? 0,
    lateToleranceMs: options.lateToleranceMs ?? 2000,
    rewindPolicy: options.rewindPolicy ?? "by-operation",
    onFire: (n, dueAtMono) =>
      fires.push({
        id: n.id,
        logical: engine.snapshot().logicalMs,
        mono: time.clock.now(),
        dueAtMono,
      }),
    onMissed: (ns, lateMs) => missed.push({ ids: ns.map((n) => n.id), lateMs }),
    onStateChange: (s) => states.push(s),
  });
  const firedIds = () => fires.map((f) => f.id);
  return { engine, time, fires, firedIds, missed, states };
}

const sec = (s: number) => s * 1000;

// --- 時刻と発火 ---

describe("time and firing", () => {
  it("counts logical time from the clock while running", () => {
    const { engine, time } = setup(abc());
    engine.start();
    time.advance(sec(12.345));
    expect(engine.snapshot().logicalMs).toBe(12345);
  });

  it("fires each notification exactly at its time", () => {
    const { engine, time, fires } = setup(abc());
    engine.start();
    time.advance(sec(31));
    expect(fires.map((f) => [f.id, f.logical])).toEqual([
      ["a#0", 10000],
      ["b#0", 20000],
      ["c#0", 30000],
    ]);
  });

  it("fires a notification its before seconds ahead of the event", () => {
    const { engine, time, fires } = setup(timelineOf(abs("p1", 0, [ev("a", 10, [note(3)])])));
    engine.start();
    time.advance(sec(11));
    expect(fires[0]?.logical).toBe(7000);
  });

  it.each([30, 120])("fires every notification on time across %i minutes", (minutes) => {
    const count = Math.floor((minutes * 60) / 7.3);
    const events = Array.from({ length: count }, (_, i) => ev(`e${i}`, (i + 1) * 7.3));
    const { engine, time, fires } = setup(timelineOf(abs("p1", 0, events)));
    engine.start();
    time.advance(sec(minutes * 60 + 60));
    expect(fires.length).toBe(count);
    expect(fires.every((f, i) => f.logical === Math.round((i + 1) * 7300))).toBe(true);
  });

  it("does not let late timer wakes add up", () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 900;
    const events = Array.from({ length: 200 }, (_, i) => ev(`e${i}`, (i + 1) * 9));
    const { engine, time, fires } = setup(timelineOf(abs("p1", 0, events)), { wakeOffset: random });
    engine.start();
    time.advance(sec(200 * 9 + 10));
    const lates = fires.map((f, i) => f.logical - (i + 1) * 9000);
    expect(fires.length).toBe(200);
    expect(Math.max(...lates)).toBeLessThanOrEqual(900);
    expect(lates.at(-1)).toBeLessThanOrEqual(900);
  });

  it("does not fire early when the timer wakes early", () => {
    let first = true;
    const wakeOffset = () => (first ? ((first = false), -400) : 0);
    const { engine, time, fires } = setup(abc(), { wakeOffset });
    engine.start();
    time.advance(sec(9.9));
    expect(fires).toEqual([]);
    time.advance(sec(0.2));
    expect(fires[0]?.logical).toBe(10000);
  });

  it("tells a notification lookahead ms early with the clock time it is due", () => {
    const { engine, time, fires } = setup(abc(), { lookaheadMs: 300 });
    engine.start();
    const started = time.clock.now();
    time.advance(sec(10));
    expect(fires[0]).toMatchObject({ logical: 9700, dueAtMono: started + 10000 });
  });

  it("tells notifications of the same moment in priority order", () => {
    const timeline = timelineOf(
      abs("p1", 0, [
        ev("low", 10, [note(0, { priority: "low" })]),
        ev("high", 10, [note(0, { priority: "high" })]),
      ]),
    );
    const { engine, time, firedIds } = setup(timeline);
    engine.start();
    time.advance(sec(11));
    expect(firedIds()).toEqual(["high#0", "low#0"]);
  });

  it("never fires a disabled notification", () => {
    const { engine, time, fires } = setup(
      timelineOf(abs("p1", 0, [ev("a", 10, [note(0, { enabled: false })])])),
    );
    engine.start();
    time.advance(sec(11));
    expect(fires).toEqual([]);
  });

  it("skips notifications noticed later than the tolerance and reports them", () => {
    const { engine, time, fires, missed } = setup(abc());
    engine.start();
    time.advance(sec(5));
    time.jump(sec(18)); // スリープ。23 秒まで誰も起きない
    time.advance(0);
    expect(fires).toEqual([]);
    expect(missed).toEqual([{ ids: ["a#0", "b#0"], lateMs: 13000 }]);
    expect(engine.snapshot().skipped).toEqual(new Set(["a#0", "b#0"]));
  });

  it("still fires a notification noticed within the tolerance", () => {
    const { engine, time, firedIds } = setup(abc());
    engine.start();
    time.advance(sec(5));
    time.jump(sec(6.5));
    time.advance(0);
    expect(firedIds()).toEqual(["a#0"]);
  });

  it("looks again when asked to process after the page becomes visible", () => {
    const { engine, time, missed } = setup(abc());
    engine.start();
    time.jump(sec(15));
    engine.process();
    expect(missed[0]?.ids).toEqual(["a#0"]);
  });
});

// --- 状態 ---

describe("states", () => {
  it("counts down from minus the given seconds", () => {
    const { engine, time } = setup(abc());
    engine.startCountdown(15);
    time.advance(sec(5));
    expect(engine.snapshot()).toMatchObject({ state: "countdown", logicalMs: -10000 });
  });

  it("starts the fight when the countdown reaches zero", () => {
    const { engine, time, states } = setup(abc());
    engine.startCountdown(3);
    time.advance(sec(3));
    expect(engine.snapshot().state).toBe("running");
    expect(states).toEqual(["countdown", "running"]);
  });

  it("fires a notification at a negative time during the countdown", () => {
    const { engine, time, fires } = setup(timelineOf(abs("p1", 0, [ev("buff", -5), ev("a", 10)])));
    engine.startCountdown(15);
    time.advance(sec(11));
    expect(fires[0]).toMatchObject({ id: "buff#0", logical: -5000 });
  });

  it("skips the rest of the countdown without reporting when started early", () => {
    const { engine, time, fires, missed } = setup(
      timelineOf(abs("p1", 0, [ev("buff", -5), ev("a", 10)])),
    );
    engine.startCountdown(15);
    time.advance(sec(3));
    engine.start();
    time.advance(sec(11));
    expect(fires.map((f) => f.id)).toEqual(["a#0"]);
    expect(missed).toEqual([]);
    expect(engine.snapshot().logicalMs).toBe(11000);
  });

  it("stops the time while paused", () => {
    const { engine, time } = setup(abc());
    engine.start();
    time.advance(sec(4));
    engine.pause();
    time.advance(sec(60));
    expect(engine.snapshot()).toMatchObject({ state: "paused", logicalMs: 4000 });
  });

  it("does not fire while paused", () => {
    const { engine, time, fires } = setup(abc());
    engine.start();
    engine.pause();
    time.advance(sec(60));
    expect(fires).toEqual([]);
  });

  it("goes on from the paused time when resumed", () => {
    const { engine, time, fires } = setup(abc());
    engine.start();
    time.advance(sec(4));
    engine.pause();
    time.advance(sec(60));
    engine.resume();
    time.advance(sec(6));
    expect(fires.map((f) => [f.id, f.logical])).toEqual([["a#0", 10000]]);
  });

  it("returns to ready and forgets what fired when stopped", () => {
    const { engine, time } = setup(abc());
    engine.start();
    time.advance(sec(15));
    engine.stop();
    expect(engine.snapshot()).toMatchObject({ state: "ready", logicalMs: 0, fired: new Set() });
  });

  it("returns to ready when restarted", () => {
    const { engine, time } = setup(abc());
    engine.startCountdown(10);
    time.advance(sec(20));
    engine.restart();
    expect(engine.snapshot()).toMatchObject({ state: "ready", logicalMs: 0, skipped: new Set() });
  });

  it("fires nothing after being stopped", () => {
    const { engine, time, fires } = setup(abc());
    engine.start();
    time.advance(sec(5));
    engine.stop();
    time.advance(sec(60));
    expect(fires).toEqual([]);
    expect(time.pending()).toBe(0);
  });

  it("finishes after the last notification", () => {
    const { engine, time } = setup(abc());
    engine.start();
    time.advance(sec(31));
    expect(engine.snapshot().state).toBe("finished");
  });

  it("does not finish while a manual phase has not started", () => {
    const { engine, time } = setup(
      timelineOf(abs("p1", 0, [ev("a", 10)]), man("p2", [ev("b", 5)])),
    );
    engine.start();
    time.advance(sec(60));
    expect(engine.snapshot().state).toBe("running");
  });

  it("runs again when moved back after finishing", () => {
    const { engine, time } = setup(abc());
    engine.start();
    time.advance(sec(31));
    engine.seek(sec(25));
    expect(engine.snapshot().state).toBe("running");
  });

  it("ignores an operation that does not fit the state", () => {
    const { engine } = setup(abc());
    engine.pause();
    engine.resume();
    engine.nudge(sec(5));
    expect(engine.snapshot()).toMatchObject({ state: "ready", logicalMs: 0 });
  });
});

// --- フェーズ ---

describe("phases", () => {
  const twoAbsolute = () => timelineOf(abs("p1", 0, [ev("a", 10)]), abs("p2", 90, [ev("b", 10)]));

  it("starts a phase with an absolute start at its time", () => {
    const { engine, time } = setup(twoAbsolute());
    engine.start();
    time.advance(sec(95));
    expect(engine.snapshot().phase).toEqual({ id: "p2", name: "テスト_p2", phaseMs: 5000 });
  });

  it("fires a notification of a later absolute phase relative to its start", () => {
    const { engine, time, fires } = setup(twoAbsolute());
    engine.start();
    time.advance(sec(101));
    expect(fires.map((f) => f.logical)).toEqual([10000, 100000]);
  });

  it("does not start a manual phase by itself", () => {
    const { engine, time, fires } = setup(
      timelineOf(abs("p1", 0, [ev("a", 10)]), man("p2", [ev("b", 5)])),
    );
    engine.start();
    time.advance(sec(120));
    expect(engine.snapshot().phase?.id).toBe("p1");
    expect(fires.map((f) => f.id)).toEqual(["a#0"]);
  });

  it("starts a manual phase at the moment it is asked to", () => {
    const { engine, time, fires } = setup(
      timelineOf(abs("p1", 0, [ev("a", 10)]), man("p2", [ev("b", 5)])),
    );
    engine.start();
    time.advance(sec(40));
    engine.startPhase("p2");
    time.advance(sec(6));
    expect(engine.snapshot().phase).toEqual({ id: "p2", name: "テスト_p2", phaseMs: 6000 });
    expect(fires.at(-1)).toMatchObject({ id: "b#0", logical: 45000 });
  });

  it("drops what is left of earlier phases when a manual phase starts", () => {
    const { engine, time, firedIds } = setup(
      timelineOf(abs("p1", 0, [ev("a", 10), ev("late", 50)]), man("p2", [ev("b", 5)])),
    );
    engine.start();
    time.advance(sec(20));
    engine.startPhase("p2");
    time.advance(sec(60));
    expect(firedIds()).toEqual(["a#0", "b#0"]);
  });

  it("forgets a later manual phase when an earlier one is started again", () => {
    const { engine, time } = setup(
      timelineOf(abs("p1", 0, [ev("a", 10)]), man("p2", [ev("b", 5)]), man("p3", [ev("c", 5)])),
    );
    engine.start();
    time.advance(sec(20));
    engine.startPhase("p3");
    time.advance(sec(1));
    engine.startPhase("p2");
    expect(engine.snapshot().phase?.id).toBe("p2");
    expect(engine.snapshot().upcomingEvents.map((e) => e.event.id)).toEqual(["b", "c"]);
  });

  it("moves to the start of an absolute phase when asked to start it", () => {
    const { engine } = setup(twoAbsolute());
    engine.start();
    engine.startPhase("p2");
    expect(engine.snapshot().logicalMs).toBe(90000);
  });
});

// --- 補正 ---

describe("corrections", () => {
  it("follows the example table of design 03", () => {
    const { engine, time } = setup(abc());
    const status = () => {
      const s = engine.snapshot();
      return ["a#0", "b#0", "c#0"].map((id) =>
        s.fired.has(id as never) ? "fired" : s.skipped.has(id as never) ? "skipped" : "pending",
      );
    };
    engine.start();
    time.advance(sec(12));
    expect(status()).toEqual(["fired", "pending", "pending"]);
    engine.seek(sec(25));
    expect(status()).toEqual(["fired", "skipped", "pending"]);
    engine.seek(sec(15));
    expect(status()).toEqual(["fired", "pending", "pending"]);
    time.advance(sec(15));
    expect(status()).toEqual(["fired", "fired", "fired"]);
  });

  it("skips what it jumps over without reporting it as missed", () => {
    const { engine, missed, firedIds } = setup(abc());
    engine.start();
    engine.seek(sec(25));
    expect(firedIds()).toEqual([]);
    expect(missed).toEqual([]);
  });

  it.each<[RewindPolicy, string[]]>([
    ["keep", ["a#0"]],
    ["by-operation", ["a#0"]],
    ["rearm", ["a#0", "a#0"]],
  ])("with %s, a nudge back right after a call fires it %j", (rewindPolicy, expected) => {
    const { engine, time, firedIds } = setup(abc(), { rewindPolicy });
    engine.start();
    time.advance(sec(10.5));
    engine.nudge(-sec(1));
    time.advance(sec(2));
    expect(firedIds()).toEqual(expected);
  });

  it("with keep, a seek back does not fire calls again", () => {
    const { engine, time, firedIds } = setup(abc(), { rewindPolicy: "keep" });
    engine.start();
    time.advance(sec(12));
    engine.seek(0);
    time.advance(sec(12));
    expect(firedIds()).toEqual(["a#0"]);
  });

  it("un-starts a manual phase when moved back before its start", () => {
    const { engine, time } = setup(
      timelineOf(abs("p1", 0, [ev("a", 10)]), man("p2", [ev("b", 5)])),
    );
    engine.start();
    time.advance(sec(40));
    engine.startPhase("p2");
    time.advance(sec(2));
    engine.seek(sec(30));
    expect(engine.snapshot().phase?.id).toBe("p1");
  });

  it("moves the time so that an event of the current phase happens now", () => {
    const { engine, time } = setup(abc());
    engine.start();
    time.advance(sec(18));
    engine.syncTo("b");
    expect(engine.snapshot().logicalMs).toBe(20000);
  });

  it("skips the calls of the event it syncs to", () => {
    const { engine, time } = setup(timelineOf(abs("p1", 0, [ev("a", 10), ev("b", 20, [note(3)])])));
    engine.start();
    time.advance(sec(12));
    engine.syncTo("b");
    expect(engine.snapshot().skipped).toEqual(new Set(["b#0"]));
  });

  it("starts a manual phase when syncing to one of its events", () => {
    const { engine, time } = setup(
      timelineOf(abs("p1", 0, [ev("a", 10)]), man("p2", [ev("b", 5), ev("c", 30)])),
    );
    engine.start();
    time.advance(sec(40));
    engine.syncTo("b");
    expect(engine.snapshot()).toMatchObject({
      logicalMs: 40000,
      phase: { id: "p2", phaseMs: 5000 },
    });
  });

  it("undoes the last correction", () => {
    const { engine, time, firedIds } = setup(abc());
    engine.start();
    time.advance(sec(12));
    engine.nudge(sec(10));
    time.advance(sec(1));
    engine.undo();
    expect(engine.snapshot().logicalMs).toBe(13000);
    time.advance(sec(8));
    expect(firedIds()).toEqual(["a#0", "b#0"]);
  });

  it("keeps the calls that fired after the correction when undoing", () => {
    const { engine, time, firedIds } = setup(abc());
    engine.start();
    time.advance(sec(5));
    engine.nudge(sec(4));
    time.advance(sec(2));
    engine.undo();
    time.advance(sec(4));
    expect(firedIds()).toEqual(["a#0"]);
    expect(engine.snapshot().logicalMs).toBe(11000);
  });

  it("keeps a call missed before the correction skipped when undoing", () => {
    const { engine, time } = setup(abc());
    engine.start();
    time.jump(sec(14));
    time.advance(0);
    engine.nudge(sec(1));
    engine.undo();
    expect(engine.snapshot().skipped).toEqual(new Set(["a#0"]));
  });

  it("undoes only once", () => {
    const { engine, time } = setup(abc());
    engine.start();
    time.advance(sec(5));
    engine.nudge(sec(10));
    engine.undo();
    expect(engine.snapshot().canUndo).toBe(false);
    engine.undo();
    expect(engine.snapshot().logicalMs).toBe(5000);
  });
});

// --- スナップショット ---

describe("snapshot", () => {
  it("lists the next notifications with the time left", () => {
    const { engine, time } = setup(abc());
    engine.start();
    time.advance(sec(12));
    expect(engine.snapshot(2).upcoming.map((u) => [u.notification.id, u.remainingMs])).toEqual([
      ["b#0", 8000],
      ["c#0", 18000],
    ]);
  });

  it("lists the next events for syncing", () => {
    const { engine, time } = setup(abc());
    engine.start();
    time.advance(sec(12));
    expect(engine.snapshot(3).upcomingEvents.map((e) => e.event.id)).toEqual(["b", "c"]);
  });

  it("names the next manual phase while many events of the current phase remain", () => {
    const many = Array.from({ length: 8 }, (_, i) => ev(`a${i}`, (i + 1) * 10));
    const { engine } = setup(timelineOf(abs("p1", 0, many), man("p2", [ev("b", 5)])));
    engine.start();
    expect(engine.snapshot(3).nextManualPhase).toEqual({ id: "p2", name: "テスト_p2" });
  });

  it("names no manual phase once it has started", () => {
    const { engine } = setup(timelineOf(abs("p1", 0, [ev("a", 10)]), man("p2", [ev("b", 5)])));
    engine.start();
    engine.startPhase("p2");
    expect(engine.snapshot().nextManualPhase).toBeNull();
  });

  it("does not fire anything by being read", () => {
    const { engine, time, fires } = setup(abc());
    engine.start();
    time.jump(sec(11));
    engine.snapshot();
    expect(fires).toEqual([]);
  });
});
