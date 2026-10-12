// ライブラリの画面 (docs/design/05-ui.md)。保存したスクリプトの一覧、読み込み (ファイル、貼り付け、サンプル)、書き出し、消す
import type { ScriptIssue } from "@timeline-call/script";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/context.tsx";
import sample from "../samples/crystal-golem.yaml?raw";
import { IssueList } from "./issue-list.tsx";
import { detectFormat, exportScript, importScript } from "./library.ts";
import type { Format, ImportRequest } from "./library.ts";
import type { ScriptRecord, ScriptStore } from "./store.ts";

type Props = {
  store: ScriptStore;
  memoryOnly: boolean;
  onOpen: (record: ScriptRecord) => void;
  onEdit: (record: ScriptRecord) => void;
  onCreate: () => void;
  onAbout: () => void;
};

type Outcome =
  | { kind: "invalid"; issues: readonly ScriptIssue[] }
  | { kind: "conflict"; existing: ScriptRecord; request: ImportRequest }
  | { kind: "warnings"; issues: readonly ScriptIssue[] }
  | { kind: "save-failed" }
  | null;

const deps = (store: ScriptStore) => ({
  store,
  now: () => Date.now(),
  newKey: () => crypto.randomUUID(),
});

function download(file: { filename: string; text: string; type: string }) {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function LibraryView({ store, memoryOnly, onOpen, onEdit, onCreate, onAbout }: Props) {
  const { t, language } = useI18n();
  const [records, setRecords] = useState<readonly ScriptRecord[]>([]);
  const [pasted, setPasted] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(null);
  // 読み込みは 1 つずつ。続けて押すと、前の保存が終わる前に同じ ID の確認をすり抜ける
  const [busy, setBusy] = useState(false);
  // 終わった読み込みの数。E2E が「保存まで終わった」ことを待つのに使う (data-imports)
  const [completed, setCompleted] = useState(0);
  const refresh = useCallback(() => void store.list().then(setRecords), [store]);
  useEffect(refresh, [refresh]);

  async function run(request: ImportRequest, openAfter = false) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await importScript(deps(store), request);
      if (result.kind === "invalid") return setOutcome({ kind: "invalid", issues: result.issues });
      if (result.kind === "conflict")
        return setOutcome({ kind: "conflict", existing: result.existing, request });
      setOutcome(result.warnings.length > 0 ? { kind: "warnings", issues: result.warnings } : null);
      setPasted("");
      refresh();
      if (openAfter) onOpen(result.record);
    } catch {
      setOutcome({ kind: "save-failed" });
    } finally {
      setBusy(false);
      setCompleted((n) => n + 1);
    }
  }

  const importText = (text: string, filename: string | null) =>
    run({ text, format: detectFormat(filename, text) });

  const date = new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <section className="flex flex-col gap-4" data-imports={completed}>
      <h2 className="text-base font-semibold">{t("library.title")}</h2>
      <p className="text-sm opacity-70">
        {t(memoryOnly ? "library.memoryOnly" : "library.backupHint")}
      </p>

      {records.length === 0 ? (
        <p className="opacity-70">{t("library.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="library">
          {records.map((r) => (
            <li
              key={r.key}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-neutral-500/10 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="text-xs opacity-60">
                  {r.metadataId} · {t("library.updated", { date: date.format(r.updatedAt) })}
                </p>
              </div>
              <Action strong onClick={() => onOpen(r)}>
                {t("library.open")}
              </Action>
              <Action onClick={() => onEdit(r)}>{t("library.edit")}</Action>
              <Action onClick={() => exportAs(r, "yaml")}>{t("library.exportYaml")}</Action>
              <Action onClick={() => exportAs(r, "json")}>{t("library.exportJson")}</Action>
              <Action
                onClick={() => {
                  if (!window.confirm(t("library.confirmDelete", { name: r.name }))) return;
                  void store.delete(r.key).then(refresh);
                }}
              >
                {t("library.delete")}
              </Action>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Action strong onClick={onCreate}>
          {t("library.new")}
        </Action>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-500/30 p-3">
        <h3 className="text-sm font-semibold">{t("library.import")}</h3>
        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-12 cursor-pointer items-center rounded-lg bg-neutral-500/20 px-4 hover:bg-neutral-500/30">
            {t("library.openFile")}
            <input
              type="file"
              accept=".yaml,.yml,.json,application/json,text/yaml"
              className="sr-only"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) await importText(await file.text(), file.name);
              }}
            />
          </label>
          <Action
            disabled={busy}
            onClick={() => run({ text: sample, format: "yaml", onConflict: "replace" }, true)}
          >
            {t("library.sample")}
          </Action>
        </div>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={t("library.pastePlaceholder")}
          aria-label={t("library.pastePlaceholder")}
          rows={6}
          className="w-full rounded border border-neutral-500/30 bg-transparent p-2 font-mono text-sm"
        />
        <div>
          <Action onClick={() => importText(pasted, null)} disabled={busy || pasted.trim() === ""}>
            {t("library.paste")}
          </Action>
        </div>
        <OutcomeView
          outcome={outcome}
          onReplace={(request) => run({ ...request, onConflict: "replace" })}
          onSeparate={(request) => run({ ...request, onConflict: "separate" })}
          onCancel={() => setOutcome(null)}
        />
      </div>

      <p className="text-center text-xs opacity-70">
        <button type="button" className="underline" onClick={onAbout}>
          {t("about.link")}
        </button>
        {" · "}FINAL FANTASY XIV © SQUARE ENIX
      </p>
    </section>
  );

  function exportAs(record: ScriptRecord, format: Format) {
    download(exportScript(record, format));
  }
}

function OutcomeView({
  outcome,
  onReplace,
  onSeparate,
  onCancel,
}: {
  outcome: Outcome;
  onReplace: (request: ImportRequest) => void;
  onSeparate: (request: ImportRequest) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  if (!outcome) return null;
  if (outcome.kind === "save-failed") return <p role="alert">{t("library.saveFailed")}</p>;
  if (outcome.kind === "conflict") {
    return (
      <div className="flex flex-col gap-2 rounded bg-amber-500/15 p-2" role="alertdialog">
        <p>
          {t("library.conflict", { id: outcome.existing.metadataId, name: outcome.existing.name })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Action strong onClick={() => onReplace(outcome.request)}>
            {t("library.replace")}
          </Action>
          <Action onClick={() => onSeparate(outcome.request)}>{t("library.separate")}</Action>
          <Action onClick={onCancel}>{t("library.cancel")}</Action>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1" role="status">
      <p className={outcome.kind === "invalid" ? "text-red-600 dark:text-red-400" : ""}>
        {t(outcome.kind === "invalid" ? "library.invalid" : "library.warnings")}
      </p>
      <IssueList issues={outcome.issues} />
    </div>
  );
}

function Action({
  children,
  onClick,
  disabled = false,
  strong = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-12 rounded-lg px-4 disabled:opacity-40 ${strong ? "bg-sky-600 text-white hover:bg-sky-500" : "bg-neutral-500/20 hover:bg-neutral-500/30"}`}
    >
      {children}
    </button>
  );
}
