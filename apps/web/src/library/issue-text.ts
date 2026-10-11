// スクリプトの問題を、利用者が直せる文にする (要件 FR-002、ADR-0011)
import type { IssuePath, ScriptIssue } from "@timeline-call/script";
import type { MessageKey } from "../i18n/ja.ts";
import type { Params } from "../i18n/translate.ts";

export function formatPath(path: IssuePath): string {
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? p : `.${p}`)).join("");
}

export function issueText(
  t: (key: MessageKey, params?: Params) => string,
  issue: ScriptIssue,
): string {
  return t(`issue.${issue.code}` as MessageKey, issue.params ?? {});
}
