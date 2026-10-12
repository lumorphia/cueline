import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// 依存の向き (AGENTS.md、ADR-0004) を eslint.config.js が本当に止めるか。ファイルは作らず、パスだけ与えて検査する
const eslint = new ESLint({ cwd: new URL("..", import.meta.url).pathname });

async function messages(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? "");
}

const restricted = async (filePath: string, code: string): Promise<boolean> =>
  (await messages(filePath, code)).includes("no-restricted-imports");

describe("eslint boundaries", () => {
  it("keeps the script free of Node APIs", async () => {
    expect(await restricted("packages/script/src/x.ts", 'import "node:fs";')).toBe(true);
  });

  it("lets the script use zod and yaml", async () => {
    expect(await restricted("packages/script/src/x.ts", 'import "zod";\nimport "yaml";')).toBe(
      false,
    );
  });

  it("keeps the script free of the engine", async () => {
    expect(await restricted("packages/script/src/x.ts", 'import "@cueline/engine";')).toBe(true);
  });

  it("keeps the engine free of React", async () => {
    expect(await restricted("packages/engine/src/x.ts", 'import "react";')).toBe(true);
  });

  it("keeps the engine free of the speech package", async () => {
    expect(await restricted("packages/engine/src/x.ts", 'import "@cueline/speech";')).toBe(true);
  });

  it("lets the engine use the script", async () => {
    expect(await restricted("packages/engine/src/x.ts", 'import "@cueline/script";')).toBe(false);
  });

  it("keeps the speech package free of the engine", async () => {
    expect(await restricted("packages/speech/src/x.ts", 'import "@cueline/engine";')).toBe(true);
  });

  it("keeps the speech package free of React", async () => {
    expect(await restricted("packages/speech/src/x.ts", 'import "react";')).toBe(true);
  });

  it("keeps the web app free of Node APIs", async () => {
    expect(await restricted("apps/web/src/x.tsx", 'import "node:fs";')).toBe(true);
  });

  it("lets the web app use every package and React", async () => {
    const code = [
      'import "react";',
      'import "@cueline/script";',
      'import "@cueline/engine";',
      'import "@cueline/speech";',
    ].join("\n");
    expect(await restricted("apps/web/src/x.tsx", code)).toBe(false);
  });

  it("makes the web app use packages through exports only", async () => {
    const code = 'import "@cueline/engine/src/engine.ts";';
    expect(await restricted("apps/web/src/x.tsx", code)).toBe(true);
  });

  it("forbids dangerouslySetInnerHTML in the web app", async () => {
    const code = "export const X = () => <div dangerouslySetInnerHTML={{ __html: '' }} />;";
    expect(await messages("apps/web/src/x.tsx", code)).toContain("no-restricted-syntax");
  });
});
