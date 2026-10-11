import { describe, expect, it } from "vitest";
import { en } from "./en.ts";
import { detectLanguage, translate } from "./translate.ts";
import { ja } from "./ja.ts";

describe("dictionaries", () => {
  it("has every Japanese key in English", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
  });

  it("uses the same placeholders in both languages", () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(ja) as (keyof typeof ja)[]) {
      expect(holes(en[key]), key).toEqual(holes(ja[key]));
    }
  });
});

describe("translate", () => {
  it("fills placeholders with the given values", () => {
    expect(translate("ja", "player.countdown", { seconds: 15 })).toBe("プル 15 秒");
  });

  it("uses English when asked", () => {
    expect(translate("en", "player.countdown", { seconds: 15 })).toBe("Pull 15s");
  });
});

describe("detectLanguage", () => {
  it("chooses Japanese for a Japanese browser", () => {
    expect(detectLanguage(["ja-JP", "en-US"])).toBe("ja");
  });

  it("chooses English for any other browser", () => {
    expect(detectLanguage(["fr-FR"])).toBe("en");
  });
});
