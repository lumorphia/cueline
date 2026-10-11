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
  | "invalid"
  // 意味
  | "duplicate_phase_id"
  | "duplicate_event_id"
  | "duplicate_tag_id"
  | "unknown_tag"
  | "first_phase_not_at_zero"
  | "phases_not_ascending"
  | "absolute_after_manual"
  | "negative_at_outside_first_phase"
  | "fires_before_manual_start"
  | "too_precise"
  | "too_many_events"
  | "too_many_notifications"
  // 警告 (読み込みは止めない)
  | "fires_before_countdown"
  | "event_after_next_phase";

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

export const warning = (
  code: ScriptIssueCode,
  path: IssuePath = [],
  params?: Record<string, string | number>,
): ScriptIssue => ({ ...error(code, path, params), severity: "warning" });
