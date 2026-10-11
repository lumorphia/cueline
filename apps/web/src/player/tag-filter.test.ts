import { describe, expect, it } from "vitest";
import { shouldPlay } from "./tag-filter.ts";

const n = (tags: string[], enabled = true) => ({ tags, enabled });

describe("shouldPlay", () => {
  it("plays every enabled notification when no tags are chosen", () => {
    expect(shouldPlay(n(["tank"]), null)).toBe(true);
  });

  it("plays a notification without tags whatever is chosen", () => {
    expect(shouldPlay(n([]), new Set(["healer"]))).toBe(true);
  });

  it("plays a notification with a chosen tag", () => {
    expect(shouldPlay(n(["tank", "healer"]), new Set(["healer"]))).toBe(true);
  });

  it("does not play a notification whose tags are all unchosen", () => {
    expect(shouldPlay(n(["tank"]), new Set(["healer"]))).toBe(false);
  });

  it("does not play a disabled notification", () => {
    expect(shouldPlay(n([], false), null)).toBe(false);
  });
});
