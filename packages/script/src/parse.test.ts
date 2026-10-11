import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { LIMITS } from "./limits.ts";
import { parseScript } from "./parse.ts";
import type { ParseResult } from "./parse.ts";
import { absolute, event, phase, script } from "./test-script.ts";

// テストの中で作る最小のスクリプト。上書きしたいところだけ渡す
const minimal = (overrides: Record<string, unknown> = {}) =>
  script({
    phases: [
      phase("p1", absolute(0), [
        event("raidwide-1", 15, {
          name: "全体攻撃",
          notifications: [{ type: "speech", text: "全体攻撃" }],
        }),
      ]),
    ],
    ...overrides,
  });

function issuesOf(result: ParseResult) {
  if (result.ok) throw new Error("通ってしまった");
  return result.issues;
}

function codesOf(result: ParseResult) {
  return issuesOf(result).map((i) => i.code);
}

describe("parseScript reading", () => {
  it("reads a YAML script", () => {
    const result = parseScript(stringify(minimal()));
    expect(result.ok).toBe(true);
  });

  it("reads the same script written as JSON into the same result", () => {
    const fromYaml = parseScript(stringify(minimal()));
    const fromJson = parseScript(JSON.stringify(minimal()), { format: "json" });
    expect(fromJson).toEqual(fromYaml);
  });

  it("fills the omitted notification settings with their defaults", () => {
    const result = parseScript(stringify(minimal({ defaults: { before: 3 } })));
    if (!result.ok) throw new Error("通らなかった");
    expect(result.script.phases[0]?.events[0]?.notifications[0]).toEqual({
      type: "speech",
      text: "全体攻撃",
      before: 3,
      tags: [],
      priority: "normal",
      enabled: true,
    });
  });

  it("accepts a script exactly at the size limit", () => {
    const body = stringify(minimal());
    const padded = body + "#".repeat(LIMITS.maxChars - body.length);
    expect(parseScript(padded).ok).toBe(true);
  });

  it("rejects a script one character over the size limit", () => {
    const body = stringify(minimal());
    const padded = body + "#".repeat(LIMITS.maxChars - body.length + 1);
    expect(codesOf(parseScript(padded))).toEqual(["too_large"]);
  });

  it("reports a YAML syntax error with its line", () => {
    const [issue] = issuesOf(parseScript("version: 1\nmetadata: [\n"));
    expect(issue?.code).toBe("yaml_syntax");
    expect(issue?.line).toBeGreaterThan(0);
  });

  it("rejects a duplicated key", () => {
    expect(codesOf(parseScript("version: 1\nversion: 1\n"))).toContain("duplicate_key");
  });

  it("rejects a custom YAML tag", () => {
    const text = stringify(minimal()).replace("name: テスト_ボス", "name: !!js/function 'x'");
    expect(codesOf(parseScript(text))).toContain("unsupported_tag");
  });

  it("rejects an alias expansion attack", () => {
    const lines = ["a: &a [x, x, x, x, x, x, x, x, x, x]"];
    const names = "abcdefghij".split("");
    const bomb = names
      .slice(1)
      .map((n, i) => `${n}: &${n} [${Array(10).fill(`*${names[i]}`).join(", ")}]`);
    expect(codesOf(parseScript([...lines, ...bomb].join("\n")))).toEqual(["too_many_aliases"]);
  });

  it("lets nesting at the depth limit through to the schema", () => {
    const nested = "[".repeat(LIMITS.maxDepth - 1) + "]".repeat(LIMITS.maxDepth - 1);
    const codes = codesOf(parseScript(`version: 1\nx: ${nested}\n`));
    expect(codes).not.toContain("too_deep");
  });

  it("rejects nesting one level deeper than the limit", () => {
    const nested = "[".repeat(LIMITS.maxDepth) + "]".repeat(LIMITS.maxDepth);
    expect(codesOf(parseScript(`version: 1\nx: ${nested}\n`))).toEqual(["too_deep"]);
  });

  it("rejects a script that is not a mapping", () => {
    expect(codesOf(parseScript("- 1\n- 2\n"))).toEqual(["not_object"]);
  });
});

describe("parseScript version", () => {
  it("rejects a script without a version", () => {
    const { version: _version, ...rest } = minimal();
    expect(codesOf(parseScript(stringify(rest)))).toEqual(["version_missing"]);
  });

  it("rejects a version that is not an integer", () => {
    expect(codesOf(parseScript(stringify(minimal({ version: "1" }))))).toEqual(["version_invalid"]);
  });

  it("asks to update the app for a newer version", () => {
    const [issue] = issuesOf(parseScript(stringify(minimal({ version: 2 }))));
    expect(issue).toMatchObject({ code: "app_update_required", params: { latest: 1 } });
  });

  it("rejects a version older than the first one", () => {
    expect(codesOf(parseScript(stringify(minimal({ version: 0 }))))).toEqual([
      "version_unsupported",
    ]);
  });
});

describe("parseScript schema", () => {
  it("reports an unknown key with its path and line", () => {
    const script = minimal();
    const text = stringify(script).replace("  language: ja-JP", "  language: ja-JP\n  langauge: x");
    const [issue] = issuesOf(parseScript(text));
    expect(issue).toMatchObject({ code: "unknown_key", path: ["metadata", "langauge"], line: 6 });
  });

  it("reports a missing required key as required", () => {
    const script = minimal({ metadata: { id: "test-boss", language: "ja-JP" } });
    expect(issuesOf(parseScript(stringify(script)))).toContainEqual(
      expect.objectContaining({ code: "required", path: ["metadata", "name"] }),
    );
  });

  it("reports a value of the wrong type", () => {
    const script = minimal({ countdown: { default: "15" } });
    expect(issuesOf(parseScript(stringify(script)))).toContainEqual(
      expect.objectContaining({ code: "invalid_type", path: ["countdown", "default"] }),
    );
  });

  it("reports an id that breaks the pattern", () => {
    const script = minimal({ metadata: { id: "Test Boss", name: "x", language: "ja-JP" } });
    expect(codesOf(parseScript(stringify(script)))).toContain("invalid_format");
  });

  it("reports a text longer than its limit", () => {
    const script = minimal({ metadata: { id: "x", name: "あ".repeat(101), language: "ja-JP" } });
    expect(issuesOf(parseScript(stringify(script)))).toContainEqual(
      expect.objectContaining({ code: "too_long", params: { max: 100 } }),
    );
  });

  it("reports a number out of its range", () => {
    const script = minimal({ defaults: { before: 601 } });
    expect(issuesOf(parseScript(stringify(script)))).toContainEqual(
      expect.objectContaining({ code: "out_of_range", path: ["defaults", "before"] }),
    );
  });

  it("reports a value that is not one of the choices", () => {
    const script = minimal();
    const text = stringify(script).replace("type: speech", "type: shout");
    expect(codesOf(parseScript(text))).toContain("invalid_choice");
  });

  it("reports an unknown phase start type", () => {
    const text = stringify(minimal()).replace("type: absolute", "type: later");
    expect(issuesOf(parseScript(text))).toContainEqual(
      expect.objectContaining({ code: "invalid_choice", path: ["phases", 0, "start", "type"] }),
    );
  });

  it("rejects a script without phases", () => {
    expect(codesOf(parseScript(stringify(minimal({ phases: [] }))))).toContain("too_few");
  });
});
