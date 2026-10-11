import { describe, expect, it } from "vitest";
import { parseScript } from "./parse.ts";
import type { Script } from "./script.ts";
import { absolute, event, manual, notification, phase, script, yamlOf } from "./test-script.ts";
import { buildTimeline } from "./timeline.ts";

function load(overrides: Record<string, unknown>): Script {
  const result = parseScript(yamlOf(script(overrides)));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.script;
}

const twoNotifications = event("e1", 10.125, {
  notifications: [notification({ text: "a", before: 5 }), notification({ text: "b" })],
});

describe("buildTimeline", () => {
  it("names each notification by its event id and position", () => {
    const timeline = buildTimeline(
      load({ phases: [phase("p1", absolute(0), [twoNotifications])] }),
    );
    expect(timeline.phases[0]?.notifications.map((n) => n.id)).toEqual(["e1#0", "e1#1"]);
  });

  it("converts seconds to whole milliseconds", () => {
    const timeline = buildTimeline(
      load({ phases: [phase("p1", absolute(0), [twoNotifications])] }),
    );
    expect(timeline.phases[0]?.events[0]?.atPhaseMs).toBe(10125);
  });

  it("fires a notification its before seconds ahead of the event", () => {
    const timeline = buildTimeline(
      load({ phases: [phase("p1", absolute(0), [twoNotifications])] }),
    );
    expect(timeline.phases[0]?.notifications[0]?.fireAtPhaseMs).toBe(5125);
  });

  it("orders notifications by fire time", () => {
    const events = [event("late", 30), event("early", 10)];
    const timeline = buildTimeline(load({ phases: [phase("p1", absolute(0), events)] }));
    expect(timeline.phases[0]?.notifications.map((n) => n.eventId)).toEqual(["early", "late"]);
  });

  it("puts a higher priority first among notifications at the same moment", () => {
    const events = [
      event("normal", 10),
      event("high", 10, { notifications: [notification({ priority: "high" })] }),
    ];
    const timeline = buildTimeline(load({ phases: [phase("p1", absolute(0), events)] }));
    expect(timeline.phases[0]?.notifications.map((n) => n.eventId)).toEqual(["high", "normal"]);
  });

  it("keeps the script order among notifications of the same moment and priority", () => {
    const events = [event("first", 10), event("second", 10)];
    const timeline = buildTimeline(load({ phases: [phase("p1", absolute(0), events)] }));
    expect(timeline.phases[0]?.notifications.map((n) => n.eventId)).toEqual(["first", "second"]);
  });

  it("keeps an absolute start in milliseconds and a manual start as manual", () => {
    const timeline = buildTimeline(
      load({
        phases: [phase("p1", absolute(0)), phase("p2", absolute(90.5)), phase("p3", manual())],
      }),
    );
    expect(timeline.phases.map((p) => p.start)).toEqual([
      { type: "absolute", atMs: 0 },
      { type: "absolute", atMs: 90500 },
      { type: "manual" },
    ]);
  });

  it("carries the countdown in milliseconds", () => {
    expect(buildTimeline(load({ countdown: { default: 15 } })).countdownMs).toBe(15000);
  });

  it("keeps a disabled notification so the list can show it", () => {
    const events = [event("e1", 10, { notifications: [notification({ enabled: false })] })];
    const timeline = buildTimeline(load({ phases: [phase("p1", absolute(0), events)] }));
    expect(timeline.phases[0]?.notifications[0]?.enabled).toBe(false);
  });
});
