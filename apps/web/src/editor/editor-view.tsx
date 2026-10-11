// エディタの画面 (docs/design/05-ui.md の「エディタ」、要件 FR-004)。表とフォームで作る・直す。
// スマホでは行をカードにする。問題は該当する欄の下に出し、エラーがある間は保存できない
import type {
  IssuePath,
  Script,
  ScriptIssue,
  ScriptNotification,
  ScriptPhase,
} from "@timeline-call/script";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/context.tsx";
import { issueText } from "../library/issue-text.ts";
import {
  addEvent,
  addNotification,
  addPhase,
  addTag,
  duplicateEvent,
  movePhase,
  removeEvent,
  removeNotification,
  removePhase,
  removeTag,
  renameTag,
  sortEvents,
  updateEvent,
  updateNotification,
  updatePhase,
} from "./draft.ts";
import { Issues, NumberField, SelectField, SmallButton, TextField, TimeField } from "./fields.tsx";
import { issuesAt, validateDraft } from "./validate.ts";

type Props = {
  initial: Script;
  /** 元のスクリプトに YAML のコメントがあったか (保存すると消えることを知らせる) */
  hadComments: boolean;
  onSave: (script: Script) => Promise<void>;
  onClose: () => void;
};

const LANGUAGES = [
  { value: "ja-JP", label: "日本語 (ja-JP)" },
  { value: "en-US", label: "English (en-US)" },
  { value: "en-GB", label: "English (en-GB)" },
];

export function EditorView({ initial, hadComments, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saved" | "failed">("idle");
  const [newTag, setNewTag] = useState("");
  const { errors, warnings } = useMemo(() => validateDraft(draft), [draft]);
  const at = (path: IssuePath) =>
    issuesAt(errors, path).filter((i) => i.path.length === path.length);

  const change = (next: Script) => {
    setDraft(next);
    setDirty(true);
    setSaved("idle");
  };

  async function save() {
    try {
      await onSave(draft);
      setDirty(false);
      setSaved("saved");
    } catch {
      setSaved("failed");
    }
  }

  const close = () => {
    if (dirty && !window.confirm(t("editor.confirmClose"))) return;
    onClose();
  };

  // 欄に結びつかない問題 (フェーズの並び、全体の数など) は上にまとめて出す
  const general = errors.filter((i) => i.path.length <= 1);

  return (
    <section className="flex flex-col gap-4" data-testid="editor">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold">{t("editor.title")}</h2>
        <SmallButton tone="strong" onClick={save} disabled={errors.length > 0}>
          {t("editor.save")}
        </SmallButton>
        <SmallButton onClick={close}>{t("editor.close")}</SmallButton>
      </div>
      <p role="status" className="text-sm">
        {errors.length > 0
          ? t("editor.errors", { count: errors.length })
          : saved === "saved"
            ? t("editor.saved")
            : saved === "failed"
              ? t("library.saveFailed")
              : dirty
                ? t("editor.unsaved")
                : ""}
      </p>
      {hadComments && <Notice>{t("editor.commentsLost")}</Notice>}
      {general.length > 0 && <Issues issues={general} />}
      {warnings.length > 0 && (
        <Notice>
          {warnings.map((w, i) => (
            <span key={i} className="block">
              {issueText(t, w)}
            </span>
          ))}
        </Notice>
      )}

      <fieldset className="grid gap-3 rounded-lg border border-neutral-500/30 p-3 sm:grid-cols-4">
        <legend className="px-1 text-sm font-semibold">{t("editor.script")}</legend>
        <TextField
          className="sm:col-span-2"
          label={t("editor.name")}
          value={draft.metadata.name}
          issues={at(["metadata", "name"])}
          onChange={(name) => change({ ...draft, metadata: { ...draft.metadata, name } })}
        />
        <SelectField
          label={t("editor.language")}
          value={draft.metadata.language}
          options={
            LANGUAGES.some((l) => l.value === draft.metadata.language)
              ? LANGUAGES
              : [...LANGUAGES, { value: draft.metadata.language, label: draft.metadata.language }]
          }
          onChange={(language) => change({ ...draft, metadata: { ...draft.metadata, language } })}
        />
        <NumberField
          label={t("editor.countdown")}
          value={draft.countdown?.default ?? 15}
          min={1}
          issues={at(["countdown", "default"])}
          onChange={(v) => change({ ...draft, countdown: { default: v } })}
        />
        <NumberField
          label={t("editor.defaultBefore")}
          value={draft.defaults.before}
          min={0}
          step={0.5}
          issues={at(["defaults", "before"])}
          onChange={(before) => change({ ...draft, defaults: { before } })}
        />
        <div className="flex flex-col gap-1 sm:col-span-3">
          <span className="text-xs opacity-60">{t("editor.tags")}</span>
          <div className="flex flex-wrap items-end gap-2">
            {draft.metadata.tags.map((tag, i) => (
              <span key={tag.id} className="flex items-end gap-1">
                <TextField
                  label={t("editor.tagLabel")}
                  hideLabel
                  value={tag.label}
                  issues={at(["metadata", "tags", i, "label"])}
                  className="w-28"
                  onChange={(label) => change(renameTag(draft, tag.id, label))}
                />
                <SmallButton
                  tone="danger"
                  label={t("editor.removeTag", { name: tag.label })}
                  onClick={() => change(removeTag(draft, tag.id))}
                >
                  ×
                </SmallButton>
              </span>
            ))}
            <span className="flex items-end gap-1">
              <TextField
                label={t("editor.newTag")}
                hideLabel
                placeholder={t("editor.newTag")}
                value={newTag}
                className="w-32"
                onChange={setNewTag}
              />
              <SmallButton
                onClick={() => {
                  if (newTag.trim() === "") return;
                  change(addTag(draft, newTag.trim()));
                  setNewTag("");
                }}
              >
                {t("editor.addTag")}
              </SmallButton>
            </span>
          </div>
        </div>
      </fieldset>

      {draft.phases.map((phase, p) => (
        <PhaseCard
          key={phase.id}
          script={draft}
          phase={phase}
          index={p}
          errors={errors}
          onChange={change}
        />
      ))}
      <div>
        <SmallButton onClick={() => change(addPhase(draft))}>{t("editor.addPhase")}</SmallButton>
      </div>
    </section>
  );
}

function PhaseCard({
  script,
  phase,
  index: p,
  errors,
  onChange,
}: {
  script: Script;
  phase: ScriptPhase;
  index: number;
  errors: readonly ScriptIssue[];
  onChange: (s: Script) => void;
}) {
  const { t } = useI18n();
  const exact = (path: IssuePath) =>
    issuesAt(errors, path).filter((i) => i.path.length === path.length);
  const absolute = phase.start.type === "absolute";
  return (
    <fieldset
      className="flex flex-col gap-3 rounded-lg border border-neutral-500/30 p-3"
      data-testid="phase"
    >
      <legend className="px-1 text-sm font-semibold">{phase.name || t("editor.phase")}</legend>
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          className="w-48"
          label={t("editor.phaseName")}
          value={phase.name}
          issues={exact(["phases", p, "name"])}
          onChange={(name) => onChange(updatePhase(script, p, { name }))}
        />
        <SelectField
          label={t("editor.phaseStart")}
          value={phase.start.type}
          options={[
            { value: "absolute", label: t("editor.startAbsolute") },
            { value: "manual", label: t("editor.startManual") },
          ]}
          issues={exact(["phases", p, "start"])}
          onChange={(type) =>
            onChange(
              updatePhase(script, p, { start: type === "absolute" ? { type, at: 0 } : { type } }),
            )
          }
        />
        {phase.start.type === "absolute" && (
          <TimeField
            className="w-24"
            label={t("editor.phaseAt")}
            value={phase.start.at}
            issues={exact(["phases", p, "start", "at"])}
            onChange={(at) => onChange(updatePhase(script, p, { start: { type: "absolute", at } }))}
          />
        )}
        <span className="ml-auto flex gap-1">
          <SmallButton
            label={t("editor.moveUp")}
            onClick={() => onChange(movePhase(script, p, -1))}
          >
            ↑
          </SmallButton>
          <SmallButton
            label={t("editor.moveDown")}
            onClick={() => onChange(movePhase(script, p, 1))}
          >
            ↓
          </SmallButton>
          <SmallButton
            tone="danger"
            onClick={() => {
              if (
                phase.events.length > 0 &&
                !window.confirm(t("editor.confirmRemovePhase", { name: phase.name }))
              )
                return;
              onChange(removePhase(script, p));
            }}
          >
            {t("editor.removePhase")}
          </SmallButton>
        </span>
      </div>
      {!absolute && <p className="text-xs opacity-60">{t("editor.manualHint")}</p>}

      <ol className="flex flex-col gap-2">
        {phase.events.map((event, e) => (
          <li
            key={event.id}
            className="flex flex-col gap-2 rounded bg-neutral-500/10 p-2"
            data-testid="event"
          >
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <TimeField
                label={t("editor.at")}
                value={event.at}
                issues={exact(["phases", p, "events", e, "at"])}
                onChange={(at) => onChange(sortEvents(updateEvent(script, p, e, { at }), p))}
              />
              <TextField
                label={t("editor.eventName")}
                value={event.name}
                issues={exact(["phases", p, "events", e, "name"])}
                onChange={(name) => onChange(updateEvent(script, p, e, { name }))}
              />
            </div>
            {/* コールは横いっぱいに使う (一番長く打つ欄なので) */}
            <div className="flex flex-col gap-2 sm:pl-[6.5rem]">
              {event.notifications.map((n, k) => (
                <NotificationRow
                  key={k}
                  script={script}
                  n={n}
                  path={["phases", p, "events", e, "notifications", k]}
                  errors={errors}
                  onChange={(change) => onChange(updateNotification(script, p, e, k, change))}
                  onRemove={() => onChange(removeNotification(script, p, e, k))}
                />
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <SmallButton onClick={() => onChange(addNotification(script, p, e))}>
                {t("editor.addNotification")}
              </SmallButton>
              <SmallButton onClick={() => onChange(duplicateEvent(script, p, e))}>
                {t("editor.duplicate")}
              </SmallButton>
              <SmallButton tone="danger" onClick={() => onChange(removeEvent(script, p, e))}>
                {t("editor.removeEvent")}
              </SmallButton>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <SmallButton onClick={() => onChange(addEvent(script, p))}>
          {t("editor.addEvent")}
        </SmallButton>
      </div>
    </fieldset>
  );
}

function NotificationRow({
  script,
  n,
  path,
  errors,
  onChange,
  onRemove,
}: {
  script: Script;
  n: ScriptNotification;
  path: IssuePath;
  errors: readonly ScriptIssue[];
  onChange: (change: Partial<ScriptNotification>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const exact = (field: string) => issuesAt(errors, [...path, field]);
  const toggleTag = (id: string) =>
    onChange({ tags: n.tags.includes(id) ? n.tags.filter((x) => x !== id) : [...n.tags, id] });
  return (
    <div className="grid grid-cols-2 gap-2 border-l-2 border-sky-500/40 pl-2 sm:grid-cols-[1fr_5rem_6rem_7rem_auto]">
      <TextField
        className="col-span-2 sm:col-span-1"
        label={t("editor.text")}
        value={n.text}
        issues={exact("text")}
        onChange={(text) => onChange({ text })}
      />
      <NumberField
        label={t("editor.before")}
        value={n.before}
        min={0}
        step={0.5}
        issues={exact("before")}
        onChange={(before) => onChange({ before })}
      />
      <SelectField
        label={t("editor.type")}
        value={n.type}
        options={[
          { value: "speech", label: t("editor.typeSpeech") },
          { value: "display", label: t("editor.typeDisplay") },
        ]}
        onChange={(type) => onChange({ type })}
      />
      <SelectField
        label={t("editor.priority")}
        value={n.priority}
        options={[
          { value: "normal", label: t("editor.priorityNormal") },
          { value: "high", label: t("editor.priorityHigh") },
          { value: "low", label: t("editor.priorityLow") },
        ]}
        onChange={(priority) => onChange({ priority })}
      />
      <span className="flex items-end justify-end">
        <SmallButton tone="danger" label={t("editor.removeNotification")} onClick={onRemove}>
          ×
        </SmallButton>
      </span>
      <div className="col-span-full flex flex-wrap items-center gap-2 text-sm">
        {script.metadata.tags.map((tag) => (
          <label key={tag.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={n.tags.includes(tag.id)}
              onChange={() => toggleTag(tag.id)}
            />
            {tag.label}
          </label>
        ))}
        <label className="ml-auto flex items-center gap-1">
          <input
            type="checkbox"
            checked={n.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          {t("editor.enabled")}
        </label>
      </div>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded bg-amber-500/15 px-3 py-2 text-sm">{children}</p>;
}
