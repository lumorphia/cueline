import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  lookaheadFor,
  saveSettings,
  tagsFor,
  withTags,
} from "./settings.ts";
import type { Settings } from "./settings.ts";

// 偽の localStorage
function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const broken = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
};

describe("loadSettings", () => {
  it("gives the defaults when nothing is saved", () => {
    expect(loadSettings(storage())).toEqual(DEFAULT_SETTINGS);
  });

  it("reads back what was saved", () => {
    const s = storage();
    const changed: Settings = {
      ...DEFAULT_SETTINGS,
      conflict: "queue",
      voice: { ...DEFAULT_SETTINGS.voice, rate: 1.5 },
    };
    saveSettings(s, changed);
    expect(loadSettings(s)).toEqual(changed);
  });

  it("gives the defaults for text that is not JSON", () => {
    expect(loadSettings(storage({ "cueline:settings": "{oops" }))).toEqual(DEFAULT_SETTINGS);
  });

  it("gives the defaults for values out of range", () => {
    const saved = JSON.stringify({
      ...DEFAULT_SETTINGS,
      voice: { ...DEFAULT_SETTINGS.voice, rate: 9 },
    });
    expect(loadSettings(storage({ "cueline:settings": saved }))).toEqual(DEFAULT_SETTINGS);
  });

  it("gives the defaults for another version", () => {
    const saved = JSON.stringify({ ...DEFAULT_SETTINGS, version: 2 });
    expect(loadSettings(storage({ "cueline:settings": saved }))).toEqual(DEFAULT_SETTINGS);
  });

  it("gives the defaults when the storage cannot be read", () => {
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("saveSettings", () => {
  it("does not throw when the storage cannot be written", () => {
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe("tags", () => {
  it("chooses every tag for a script nobody has set", () => {
    expect(tagsFor(DEFAULT_SETTINGS, "test-boss")).toBeNull();
  });

  it("remembers the chosen tags per script", () => {
    const s = withTags(withTags(DEFAULT_SETTINGS, "boss-a", ["tank"]), "boss-b", ["healer"]);
    expect([...(tagsFor(s, "boss-a") ?? [])]).toEqual(["tank"]);
    expect([...(tagsFor(s, "boss-b") ?? [])]).toEqual(["healer"]);
  });

  it("goes back to every tag when cleared", () => {
    const s = withTags(withTags(DEFAULT_SETTINGS, "boss-a", ["tank"]), "boss-a", null);
    expect(tagsFor(s, "boss-a")).toBeNull();
  });
});

describe("lookaheadFor", () => {
  it("speaks early by the measured start delay", () => {
    expect(lookaheadFor({ ...DEFAULT_SETTINGS, compensateLatency: true, latencyMs: 320 })).toBe(
      320,
    );
  });

  it("does not speak early when the delay is not measured", () => {
    expect(lookaheadFor({ ...DEFAULT_SETTINGS, compensateLatency: true, latencyMs: null })).toBe(0);
  });

  it("does not speak early when turned off", () => {
    expect(lookaheadFor({ ...DEFAULT_SETTINGS, compensateLatency: false, latencyMs: 320 })).toBe(0);
  });
});
