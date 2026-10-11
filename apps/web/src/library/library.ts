// ライブラリ (docs/design/05-ui.md、06-storage.md)。読み込み (要件 FR-001、002)、保存、書き出し (FR-005)
import { parseScript, serializeScript } from "@timeline-call/script";
import type { ScriptIssue } from "@timeline-call/script";
import type { ScriptRecord, ScriptStore } from "./store.ts";

export type Format = "yaml" | "json";

export type ImportDeps = { store: ScriptStore; now: () => number; newKey: () => string };

export type ImportRequest = {
  text: string;
  format: Format;
  /** 同じ metadata.id のスクリプトがあったとき。既定は ask (上書きか別に保存かを利用者に聞く) */
  onConflict?: "ask" | "replace" | "separate";
};

export type ImportResult =
  | { kind: "invalid"; issues: readonly ScriptIssue[] }
  | { kind: "conflict"; existing: ScriptRecord }
  | { kind: "saved"; record: ScriptRecord; warnings: readonly ScriptIssue[] };

export async function importScript(deps: ImportDeps, req: ImportRequest): Promise<ImportResult> {
  const parsed = parseScript(req.text, { format: req.format });
  if (!parsed.ok) return { kind: "invalid", issues: parsed.issues };
  const { metadata } = parsed.script;
  const existing = (await deps.store.list()).find((r) => r.metadataId === metadata.id);
  const onConflict = req.onConflict ?? "ask";
  if (existing && onConflict === "ask") return { kind: "conflict", existing };
  const record: ScriptRecord = {
    key: existing && onConflict === "replace" ? existing.key : deps.newKey(),
    metadataId: metadata.id,
    name: metadata.name,
    format: req.format,
    source: req.text,
    updatedAt: deps.now(),
  };
  await deps.store.put(record);
  return { kind: "saved", record, warnings: parsed.warnings };
}

export function exportScript(record: ScriptRecord, format: Format) {
  const parsed = parseScript(record.source, { format: record.format });
  if (!parsed.ok) throw new Error("保存してあるスクリプトが読めない");
  return {
    filename: `${record.metadataId}.${format}`,
    text: serializeScript(parsed.script, format),
    type: format === "json" ? "application/json" : "text/yaml",
  };
}

/** 拡張子で決め、分からなければ中身で決める (02: 分からなければ YAML) */
export function detectFormat(filename: string | null, text: string): Format {
  const ext = filename?.toLowerCase().match(/\.(json|ya?ml)$/)?.[1];
  if (ext) return ext === "json" ? "json" : "yaml";
  return text.trimStart().startsWith("{") ? "json" : "yaml";
}
