import { parseScript } from "@timeline-call/script";
import type { Script } from "@timeline-call/script";
import { describe, expect, it } from "vitest";
import {
  addEvent,
  addNotification,
  addPhase,
  addTag,
  duplicateEvent,
  movePhase,
  newScript,
  removeEvent,
  removeNotification,
  removePhase,
  removeTag,
  renameTag,
  sortEvents,
  updateEvent,
  updateNotification,
  updatePhase,
} from "./draft.ts";

const base = () => newScript({ name: "テスト_新しい", randomId: () => "abc123" });

describe("newScript", () => {
  it("starts with one phase from the pull and no events", () => {
    const s = base();
    expect(s.metadata).toMatchObject({ id: "my-abc123", name: "テスト_新しい", language: "ja-JP" });
    expect(s.phases).toEqual([
      { id: "p1", name: "フェーズ1", start: { type: "absolute", at: 0 }, events: [] },
    ]);
  });
});

describe("phases", () => {
  it("adds a manual phase with the next free id", () => {
    const s = addPhase(addPhase(base()));
    expect(s.phases.map((p) => [p.id, p.start.type])).toEqual([
      ["p1", "absolute"],
      ["p2", "manual"],
      ["p3", "manual"],
    ]);
  });

  it("does not reuse an id still in use after a removal", () => {
    const s = addPhase(removePhase(addPhase(addPhase(base())), 1));
    expect(s.phases.map((p) => p.id)).toEqual(["p1", "p3", "p2"]);
  });

  it("changes a phase without touching the others", () => {
    const original = addPhase(base());
    const s = updatePhase(original, 1, { name: "テスト_移行" });
    expect(s.phases[1]?.name).toBe("テスト_移行");
    expect(original.phases[1]?.name).not.toBe("テスト_移行");
  });

  it("moves a phase down", () => {
    const s = movePhase(addPhase(addPhase(base())), 1, 1);
    expect(s.phases.map((p) => p.id)).toEqual(["p1", "p3", "p2"]);
  });

  it("does not move a phase past the ends", () => {
    const s = addPhase(base());
    expect(movePhase(s, 0, -1)).toEqual(s);
  });
});

describe("events", () => {
  it("adds an event with a call that reads its name", () => {
    const s = addEvent(base(), 0);
    expect(s.phases[0]?.events[0]).toEqual({
      id: "e1",
      at: 0,
      name: "イベント1",
      notifications: [
        {
          type: "speech",
          text: "イベント1",
          before: 0,
          tags: [],
          priority: "normal",
          enabled: true,
        },
      ],
    });
  });

  it("puts a new event ten seconds after the last one", () => {
    const s = addEvent(addEvent(base(), 0, { at: 15 }), 0);
    expect(s.phases[0]?.events.map((e) => e.at)).toEqual([15, 25]);
  });

  it("uses the default before of the script for a new call", () => {
    const s = addEvent({ ...base(), defaults: { before: 3 } }, 0);
    expect(s.phases[0]?.events[0]?.notifications[0]?.before).toBe(3);
  });

  it("keeps event ids unique across phases", () => {
    const s = addEvent(addPhase(addEvent(base(), 0)), 1);
    expect(s.phases.flatMap((p) => p.events.map((e) => e.id))).toEqual(["e1", "e2"]);
  });

  it("changes an event", () => {
    const s = updateEvent(addEvent(base(), 0), 0, 0, { name: "テスト_全体攻撃", at: 8 });
    expect(s.phases[0]?.events[0]).toMatchObject({ name: "テスト_全体攻撃", at: 8 });
  });

  it("removes an event", () => {
    const s = removeEvent(addEvent(addEvent(base(), 0), 0), 0, 0);
    expect(s.phases[0]?.events.map((e) => e.id)).toEqual(["e2"]);
  });

  it("duplicates an event right after itself with a new id", () => {
    const s = duplicateEvent(addEvent(addEvent(base(), 0), 0), 0, 0);
    expect(s.phases[0]?.events.map((e) => e.id)).toEqual(["e1", "e3", "e2"]);
    expect(s.phases[0]?.events[1]?.name).toBe("イベント1");
  });

  it("sorts the events of a phase by time and keeps the order of equal times", () => {
    let s = addEvent(addEvent(addEvent(base(), 0, { at: 30 }), 0, { at: 10 }), 0, { at: 10 });
    s = sortEvents(s, 0);
    expect(s.phases[0]?.events.map((e) => e.id)).toEqual(["e2", "e3", "e1"]);
  });
});

describe("notifications", () => {
  const withEvent = () => addEvent(base(), 0);

  it("adds a display call for the same event", () => {
    const s = addNotification(withEvent(), 0, 0);
    expect(s.phases[0]?.events[0]?.notifications.map((n) => n.type)).toEqual(["speech", "display"]);
  });

  it("changes a call", () => {
    const s = updateNotification(withEvent(), 0, 0, 0, { text: "テスト_散開", before: 3 });
    expect(s.phases[0]?.events[0]?.notifications[0]).toMatchObject({
      text: "テスト_散開",
      before: 3,
    });
  });

  it("removes a call", () => {
    const s = removeNotification(addNotification(withEvent(), 0, 0), 0, 0, 0);
    expect(s.phases[0]?.events[0]?.notifications.map((n) => n.type)).toEqual(["display"]);
  });
});

describe("tags", () => {
  it("adds a tag with an id the script accepts", () => {
    const s = addTag(addTag(base(), "タンク"), "ヒーラー");
    expect(s.metadata.tags).toEqual([
      { id: "t1", label: "タンク" },
      { id: "t2", label: "ヒーラー" },
    ]);
  });

  it("renames a tag and keeps its id", () => {
    const s = renameTag(addTag(base(), "タンク"), "t1", "MT");
    expect(s.metadata.tags).toEqual([{ id: "t1", label: "MT" }]);
  });

  it("takes a removed tag off every call", () => {
    let s = addTag(addEvent(base(), 0), "タンク");
    s = updateNotification(s, 0, 0, 0, { tags: ["t1"] });
    s = removeTag(s, "t1");
    expect(s.metadata.tags).toEqual([]);
    expect(s.phases[0]?.events[0]?.notifications[0]?.tags).toEqual([]);
  });
});

describe("a draft built from scratch", () => {
  it("reads as a valid script", async () => {
    const { serializeScript } = await import("@timeline-call/script");
    let s: Script = addTag(base(), "タンク");
    s = addEvent(s, 0, { at: 8 });
    s = addPhase(s);
    s = addEvent(s, 1, { at: 5 });
    expect(parseScript(serializeScript(s, "yaml"))).toMatchObject({ ok: true, warnings: [] });
  });
});
