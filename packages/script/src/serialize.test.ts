import { describe, expect, it } from "vitest";
import { parseScript } from "./parse.ts";
import type { Script } from "./script.ts";
import { serializeScript } from "./serialize.ts";
import { absolute, event, manual, notification, phase, script, yamlOf } from "./test-script.ts";

// 書き出しで使う項目を一通り持つスクリプト
const full = script({
  metadata: {
    id: "test-full",
    name: "テスト_全部",
    description: "説明",
    author: "テスト_作者",
    language: "ja-JP",
    tags: [{ id: "tank", label: "タンク" }],
  },
  countdown: { default: 15 },
  defaults: { before: 2 },
  phases: [
    phase("p1", absolute(0), [
      event("e1", -5, { notifications: [notification({ before: 0, tags: ["tank"] })] }),
      event("e2", 12.5, {
        notifications: [
          notification({ type: "display", priority: "high", enabled: false }),
          notification({ text: "次" }),
        ],
      }),
    ]),
    phase("p2", manual(), [event("e3", 8)]),
  ],
});

function load(text: string, format?: "yaml" | "json"): Script {
  const result = parseScript(text, format ? { format } : {});
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.script;
}

describe("serializeScript", () => {
  const original = load(yamlOf(full));

  it("writes YAML that reads back into the same script", () => {
    expect(load(serializeScript(original, "yaml"))).toEqual(original);
  });

  it("writes JSON that reads back into the same script", () => {
    expect(load(serializeScript(original, "json"), "json")).toEqual(original);
  });

  it("writes the filled-in defaults of each notification", () => {
    const text = serializeScript(load(yamlOf(script())), "json");
    const [n] = JSON.parse(text).phases[0].events[0].notifications;
    expect(n).toEqual({
      type: "speech",
      text: "テスト_コール",
      before: 0,
      tags: [],
      priority: "normal",
      enabled: true,
    });
  });

  it("writes the top-level keys in the documented order", () => {
    const keys = Object.keys(JSON.parse(serializeScript(original, "json")));
    expect(keys).toEqual(["version", "metadata", "countdown", "defaults", "phases"]);
  });

  it("leaves out optional keys the script does not have", () => {
    const keys = Object.keys(JSON.parse(serializeScript(load(yamlOf(script())), "json")));
    expect(keys).toEqual(["version", "metadata", "defaults", "phases"]);
  });
});
