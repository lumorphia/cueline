import { parseScript } from "@cueline/script";
import { describe, expect, it } from "vitest";
import { detectFormat, exportScript, importScript } from "./library.ts";
import { createMemoryStore } from "./store.ts";
import type { ScriptRecord } from "./store.ts";

const yaml = (id: string, name = "テスト_ボス", extra = "") => `version: 1
metadata:
  id: ${id}
  name: ${name}
  language: ja-JP
phases:
  - id: p1
    name: フェーズ1
    start: { type: absolute, at: 0 }
    events:
      - id: e1
        at: 10
        name: テスト_全体攻撃
        notifications:
          - { type: speech, text: テスト, before: 3 }
${extra}`;

function setup() {
  const store = createMemoryStore();
  let t = 1000;
  let n = 0;
  const deps = { store, now: () => (t += 1000), newKey: () => `k${++n}` };
  return { store, deps };
}

describe("importScript", () => {
  it("saves a valid script with its name and id", async () => {
    const { store, deps } = setup();
    const result = await importScript(deps, { text: yaml("test-a"), format: "yaml" });
    expect(result.kind).toBe("saved");
    expect(await store.list()).toEqual([
      expect.objectContaining({
        key: "k1",
        metadataId: "test-a",
        name: "テスト_ボス",
        format: "yaml",
      }),
    ]);
  });

  it("refuses an invalid script and saves nothing", async () => {
    const { store, deps } = setup();
    const result = await importScript(deps, { text: "version: 1\n", format: "yaml" });
    expect(result.kind).toBe("invalid");
    expect(await store.list()).toEqual([]);
  });

  it("keeps the warnings of a script it saves", async () => {
    const { deps } = setup();
    const overlapping =
      yaml("test-w").replace("at: 10\n", "at: 70\n") +
      "  - id: p2\n    name: フェーズ2\n    start: { type: absolute, at: 60 }\n    events: []\n";
    const result = await importScript(deps, { text: overlapping, format: "yaml" });
    expect(result.kind === "saved" && result.warnings.map((w) => w.code)).toEqual([
      "event_after_next_phase",
    ]);
  });

  it("asks before replacing a script with the same id", async () => {
    const { store, deps } = setup();
    await importScript(deps, { text: yaml("test-a"), format: "yaml" });
    const result = await importScript(deps, {
      text: yaml("test-a", "テスト_新しい"),
      format: "yaml",
    });
    expect(result).toMatchObject({ kind: "conflict", existing: { key: "k1" } });
    expect((await store.list()).map((r) => r.name)).toEqual(["テスト_ボス"]);
  });

  it("replaces the script with the same id when asked to", async () => {
    const { store, deps } = setup();
    await importScript(deps, { text: yaml("test-a"), format: "yaml" });
    await importScript(deps, {
      text: yaml("test-a", "テスト_新しい"),
      format: "yaml",
      onConflict: "replace",
    });
    expect((await store.list()).map((r) => [r.key, r.name])).toEqual([["k1", "テスト_新しい"]]);
  });

  it("saves the script separately when asked to", async () => {
    const { store, deps } = setup();
    await importScript(deps, { text: yaml("test-a"), format: "yaml" });
    await importScript(deps, {
      text: yaml("test-a", "テスト_別"),
      format: "yaml",
      onConflict: "separate",
    });
    expect((await store.list()).map((r) => r.key)).toEqual(["k2", "k1"]);
  });
});

describe("store", () => {
  it("lists the most recently saved first", async () => {
    const { store, deps } = setup();
    await importScript(deps, { text: yaml("test-a"), format: "yaml" });
    await importScript(deps, { text: yaml("test-b"), format: "yaml" });
    expect((await store.list()).map((r) => r.metadataId)).toEqual(["test-b", "test-a"]);
  });

  it("forgets a deleted script", async () => {
    const { store, deps } = setup();
    await importScript(deps, { text: yaml("test-a"), format: "yaml" });
    await store.delete("k1");
    expect(await store.get("k1")).toBeNull();
  });
});

describe("exportScript", () => {
  const record: ScriptRecord = {
    key: "k1",
    metadataId: "test-a",
    name: "テスト_ボス",
    format: "yaml",
    source: yaml("test-a"),
    updatedAt: 0,
  };

  it.each(["yaml", "json"] as const)("writes %s that reads back into the same script", (format) => {
    const file = exportScript(record, format);
    const original = parseScript(record.source);
    const again = parseScript(file.text, { format });
    expect(again.ok && original.ok && again.script).toEqual(original.ok && original.script);
  });

  it("names the file after the script id", () => {
    expect(exportScript(record, "json")).toMatchObject({
      filename: "test-a.json",
      type: "application/json",
    });
  });
});

describe("detectFormat", () => {
  it.each([
    ["boss.json", "", "json"],
    ["boss.yml", "", "yaml"],
    ["boss.yaml", "{}", "yaml"],
    [null, '  {"version": 1}', "json"],
    [null, "version: 1", "yaml"],
  ] as const)("reads %s / %j as %s", (name, text, format) => {
    expect(detectFormat(name, text)).toBe(format);
  });
});
