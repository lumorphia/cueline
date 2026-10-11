// スクリプトの問題 (docs/design/02-timeline-script.md の「検証の段」)。画面の文言は code を辞書で引く (ADR-0011)
export type ScriptIssueCode =
  // 読み取り
  | "too_large"
  | "yaml_syntax"
  | "duplicate_key"
  | "unsupported_tag"
  | "too_many_aliases"
  | "too_deep"
  | "not_object"
  // 版
  | "version_missing"
  | "version_invalid"
  | "version_unsupported"
  | "app_update_required"
  // 形
  | "required"
  | "unknown_key"
  | "invalid_type"
  | "invalid_format"
  | "invalid_choice"
  | "too_short"
  | "too_long"
  | "too_few"
  | "too_many"
  | "out_of_range"
  | "invalid";

export type IssuePath = readonly (string | number)[];

export type ScriptIssue = {
  severity: "error" | "warning";
  code: ScriptIssueCode;
  path: IssuePath;
  params?: Record<string, string | number>;
  line?: number;
};

export const error = (
  code: ScriptIssueCode,
  path: IssuePath = [],
  params?: Record<string, string | number>,
): ScriptIssue => ({ severity: "error", code, path, ...(params ? { params } : {}) });
