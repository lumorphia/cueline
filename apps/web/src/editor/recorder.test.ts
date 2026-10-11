import { describe, expect, it } from "vitest";
import { newScript } from "./draft.ts";
import { applyRecording, createRecorder } from "./recorder.ts";

function setup() {
  let t = 1000;
  const recorder = createRecorder(() => t);
  return { recorder, advance: (s: number) => (t += s * 1000) };
}

describe("createRecorder", () => {
  it("does not stamp before the clock starts", () => {
    const { recorder } = setup();
    expect(recorder.stamp()).toBeNull();
  });

  it("stamps the time since the start rounded to a tenth", () => {
    const { recorder, advance } = setup();
    recorder.start();
    advance(8.04);
    expect(recorder.stamp()).toEqual({ phase: 0, at: 8 });
  });

  it("stamps a negative time during the countdown", () => {
    const { recorder, advance } = setup();
    recorder.startCountdown(15);
    advance(10);
    expect(recorder.stamp()).toEqual({ phase: 0, at: -5 });
  });

  it("counts a new phase from zero", () => {
    const { recorder, advance } = setup();
    recorder.start();
    advance(40);
    recorder.nextPhase();
    advance(6);
    expect(recorder.stamp()).toEqual({ phase: 1, at: 6 });
  });

  it("takes back the last stamp", () => {
    const { recorder, advance } = setup();
    recorder.start();
    advance(5);
    recorder.stamp();
    advance(5);
    recorder.stamp();
    recorder.undo();
    expect(recorder.result()).toEqual([{ stamps: [5] }]);
  });

  it("takes back an empty phase", () => {
    const { recorder } = setup();
    recorder.start();
    recorder.nextPhase();
    recorder.undo();
    expect(recorder.result()).toEqual([{ stamps: [] }]);
  });
});

describe("applyRecording", () => {
  it("adds the stamps of the first phase to the chosen phase", () => {
    const s = applyRecording(newScript({ name: "x", randomId: () => "x" }), 0, [
      { stamps: [8, 20] },
    ]);
    expect(s.phases[0]?.events.map((e) => [e.at, e.name])).toEqual([
      [8, "イベント1"],
      [20, "イベント2"],
    ]);
  });

  it("adds a manual phase for each later recorded phase", () => {
    const s = applyRecording(newScript({ name: "x", randomId: () => "x" }), 0, [
      { stamps: [8] },
      { stamps: [6, 18] },
    ]);
    expect(s.phases.map((p) => [p.start.type, p.events.map((e) => e.at)])).toEqual([
      ["absolute", [8]],
      ["manual", [6, 18]],
    ]);
  });
});
