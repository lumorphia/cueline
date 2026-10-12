// エディタの検証。読み込みと同じ規則 (packages/script) を使い、問題をパスで欄に結びつける (05 の「エディタ」)
import { parseScript, serializeScript } from "@cueline/script";
import type { IssuePath, Script, ScriptIssue } from "@cueline/script";

export function validateDraft(script: Script): { errors: ScriptIssue[]; warnings: ScriptIssue[] } {
  const result = parseScript(serializeScript(script, "json"), { format: "json" });
  // 行は書き出した JSON の行で、利用者には意味が無いので外す
  const strip = (issues: readonly ScriptIssue[]) => issues.map(({ line: _line, ...rest }) => rest);
  if (result.ok) return { errors: [], warnings: strip(result.warnings) };
  return {
    errors: strip(result.issues.filter((i) => i.severity === "error")),
    warnings: strip(result.issues.filter((i) => i.severity === "warning")),
  };
}

/** path から始まる問題 (その欄か、その行の中) */
export function issuesAt(issues: readonly ScriptIssue[], path: IssuePath): ScriptIssue[] {
  return issues.filter((i) => path.every((p, n) => i.path[n] === p));
}
