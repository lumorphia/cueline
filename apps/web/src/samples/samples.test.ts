import { parseScript } from "@timeline-call/script";
import { describe, expect, it } from "vitest";
import text from "./crystal-golem.yaml?raw";

// 同梱のサンプル (要件 FR-007)。架空のボスで、エラーも警告も無いこと
describe("sample crystal golem", () => {
  it("reads without errors or warnings", () => {
    const result = parseScript(text);
    expect(result.ok && result.warnings).toEqual([]);
  });
});
