import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.ts";
import { parseScript } from "./parse.ts";
import type { ParseResult } from "./parse.ts";
import { absolute, event, manual, notification, phase, script, yamlOf } from "./test-script.ts";

const parse = (overrides: Record<string, unknown>) => parseScript(yamlOf(script(overrides)));

function issuesOf(result: ParseResult) {
  return result.ok ? result.warnings : result.issues;
}

const withPhases = (...phases: Record<string, unknown>[]) => parse({ phases });

describe("ids", () => {
  it("rejects a duplicated phase id", () => {
    const result = withPhases(phase("p1", absolute(0)), phase("p1", absolute(60)));
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({ code: "duplicate_phase_id", path: ["phases", 1, "id"] }),
    );
  });

  it("rejects an event id used again in another phase", () => {
    const result = withPhases(
      phase("p1", absolute(0), [event("e1", 10)]),
      phase("p2", absolute(60), [event("e1", 10)]),
    );
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({
        code: "duplicate_event_id",
        path: ["phases", 1, "events", 0, "id"],
      }),
    );
  });

  it("rejects a duplicated tag id", () => {
    const tags = [
      { id: "tank", label: "タンク" },
      { id: "tank", label: "タンク2" },
    ];
    const result = parse({ metadata: { id: "x", name: "x", language: "ja-JP", tags } });
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({ code: "duplicate_tag_id", path: ["metadata", "tags", 1, "id"] }),
    );
  });

  it("rejects a notification tag that metadata does not define", () => {
    const result = withPhases(
      phase("p1", absolute(0), [
        event("e1", 10, { notifications: [notification({ tags: ["mt"] })] }),
      ]),
    );
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({
        code: "unknown_tag",
        path: ["phases", 0, "events", 0, "notifications", 0, "tags", 0],
      }),
    );
  });
});

describe("phases", () => {
  it("rejects a first phase that does not start at zero", () => {
    const result = withPhases(phase("p1", absolute(5)));
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({ code: "first_phase_not_at_zero", path: ["phases", 0, "start"] }),
    );
  });

  it("rejects a first phase that starts manually", () => {
    const result = withPhases(phase("p1", manual()));
    expect(issuesOf(result).map((i) => i.code)).toContain("first_phase_not_at_zero");
  });

  it("rejects absolute phases out of order", () => {
    const result = withPhases(
      phase("p1", absolute(0)),
      phase("p2", absolute(90)),
      phase("p3", absolute(90)),
    );
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({ code: "phases_not_ascending", path: ["phases", 2, "start", "at"] }),
    );
  });

  it("rejects an absolute phase after a manual one", () => {
    const result = withPhases(
      phase("p1", absolute(0)),
      phase("p2", manual()),
      phase("p3", absolute(300)),
    );
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({ code: "absolute_after_manual", path: ["phases", 2, "start"] }),
    );
  });

  it("accepts manual phases after absolute ones", () => {
    const result = withPhases(
      phase("p1", absolute(0)),
      phase("p2", manual()),
      phase("p3", manual()),
    );
    expect(result.ok).toBe(true);
  });
});

describe("times", () => {
  it("accepts a negative time in the first phase for the countdown", () => {
    expect(withPhases(phase("p1", absolute(0), [event("e1", -5)])).ok).toBe(true);
  });

  it("rejects a negative time outside the first phase", () => {
    const result = withPhases(
      phase("p1", absolute(0)),
      phase("p2", absolute(60), [event("e1", -5)]),
    );
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({
        code: "negative_at_outside_first_phase",
        path: ["phases", 1, "events", 0, "at"],
      }),
    );
  });

  it("rejects a manual phase notification that would fire before the phase starts", () => {
    const result = withPhases(
      phase("p1", absolute(0)),
      phase("p2", manual(), [event("e1", 3, { notifications: [notification({ before: 5 })] })]),
    );
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({
        code: "fires_before_manual_start",
        path: ["phases", 1, "events", 0, "notifications", 0, "before"],
      }),
    );
  });

  it("rejects a time with more precision than milliseconds", () => {
    const result = withPhases(phase("p1", absolute(0), [event("e1", 10.0005)]));
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({ code: "too_precise", path: ["phases", 0, "events", 0, "at"] }),
    );
  });

  it("accepts a time in milliseconds", () => {
    expect(withPhases(phase("p1", absolute(0), [event("e1", 10.125)])).ok).toBe(true);
  });

  it("warns about a notification that fires before the countdown begins", () => {
    const result = parse({
      countdown: { default: 10 },
      phases: [
        phase("p1", absolute(0), [
          event("e1", -5, { notifications: [notification({ before: 8 })] }),
        ]),
      ],
    });
    expect(result.ok).toBe(true);
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({ severity: "warning", code: "fires_before_countdown" }),
    );
  });

  it("warns about an event after the next phase has started", () => {
    const result = withPhases(
      phase("p1", absolute(0), [event("e1", 70)]),
      phase("p2", absolute(60)),
    );
    expect(result.ok).toBe(true);
    expect(issuesOf(result)).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "event_after_next_phase",
        path: ["phases", 0, "events", 0, "at"],
      }),
    );
  });
});

describe("totals", () => {
  const events = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => event(`${prefix}${i}`, i % 600, { notifications: [] }));

  it("accepts events exactly at the total limit", () => {
    const half = LIMITS.maxEvents / 2;
    const result = withPhases(
      phase("p1", absolute(0), events(half, "a")),
      phase("p2", absolute(600), events(half, "b")),
    );
    expect(issuesOf(result).map((i) => i.code)).not.toContain("too_many_events");
  });

  it("rejects one event over the total limit", () => {
    const half = LIMITS.maxEvents / 2;
    const result = withPhases(
      phase("p1", absolute(0), events(half, "a")),
      phase("p2", absolute(600), events(half + 1, "b")),
    );
    expect(issuesOf(result).map((i) => i.code)).toContain("too_many_events");
  });

  it("rejects notifications over the total limit", () => {
    const per = LIMITS.maxNotificationsPerEvent;
    const count = Math.floor(LIMITS.maxNotifications / per) + 1;
    const many = Array.from({ length: count }, (_, i) =>
      event(`n${i}`, i % 600, { notifications: Array.from({ length: per }, () => notification()) }),
    );
    const result = withPhases(phase("p1", absolute(0), many));
    expect(issuesOf(result).map((i) => i.code)).toContain("too_many_notifications");
  });
});
