// エディタの入力欄。問題 (ScriptIssue) があれば欄の下に直し方を出す
import type { ScriptIssue } from "@timeline-call/script";
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/context.tsx";
import { issueText } from "../library/issue-text.ts";
import { formatTime, parseTimeInput } from "./time-input.ts";

const INPUT =
  "w-full min-w-0 rounded border bg-transparent px-2 py-1.5 aria-invalid:border-red-500 border-neutral-500/40";

export function Issues({ issues }: { issues: readonly ScriptIssue[] }) {
  const { t } = useI18n();
  if (issues.length === 0) return null;
  return (
    <span className="block text-xs text-red-600 dark:text-red-400" role="alert">
      {issues.map((i) => issueText(t, i)).join(" / ")}
    </span>
  );
}

type FieldProps = {
  label: string;
  issues?: readonly ScriptIssue[];
  className?: string;
  hideLabel?: boolean;
};

function Labeled({
  label,
  issues = [],
  className = "",
  hideLabel = false,
  children,
}: FieldProps & { children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-xs opacity-60"}>
        {label}
      </label>
      {children(id)}
      <Issues issues={issues} />
    </span>
  );
}

export function TextField(
  props: FieldProps & { value: string; onChange: (v: string) => void; placeholder?: string },
) {
  return (
    <Labeled {...props}>
      {(id) => (
        <input
          id={id}
          value={props.value}
          placeholder={props.placeholder}
          aria-invalid={(props.issues?.length ?? 0) > 0}
          onChange={(e) => props.onChange(e.target.value)}
          className={INPUT}
        />
      )}
    </Labeled>
  );
}

/** 数の欄。打っている途中の文字は手元に持ち、読める数になったときだけ渡す */
export function NumberField(
  props: FieldProps & { value: number; onChange: (v: number) => void; step?: number; min?: number },
) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(String(props.value)), [props.value]);
  return (
    <Labeled {...props}>
      {(id) => (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={props.step ?? 1}
          min={props.min}
          value={text}
          aria-invalid={(props.issues?.length ?? 0) > 0}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value !== "" && Number.isFinite(Number(e.target.value)))
              props.onChange(Number(e.target.value));
          }}
          className={INPUT}
        />
      )}
    </Labeled>
  );
}

/** 時刻の欄。「分:秒」でも秒でも受け付け、欄を離れたときに確定する (打っている途中で行を動かさない) */
export function TimeField(props: FieldProps & { value: number; onChange: (v: number) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(formatTime(props.value));
  const [bad, setBad] = useState(false);
  useEffect(() => setText(formatTime(props.value)), [props.value]);
  const commit = () => {
    const seconds = parseTimeInput(text);
    if (seconds === null) return setBad(true);
    setBad(false);
    setText(formatTime(seconds));
    if (seconds !== props.value) props.onChange(seconds);
  };
  return (
    <Labeled {...props}>
      {(id) => (
        <>
          <input
            id={id}
            value={text}
            inputMode="decimal"
            aria-invalid={bad || (props.issues?.length ?? 0) > 0}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className={`${INPUT} font-mono`}
          />
          {bad && (
            <span className="text-xs text-red-600 dark:text-red-400">{t("editor.badTime")}</span>
          )}
        </>
      )}
    </Labeled>
  );
}

export function SelectField<V extends string>(
  props: FieldProps & {
    value: V;
    options: readonly { value: V; label: string }[];
    onChange: (v: V) => void;
  },
) {
  return (
    <Labeled {...props}>
      {(id) => (
        <select
          id={id}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value as V)}
          className={INPUT}
        >
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Labeled>
  );
}

export function SmallButton({
  children,
  onClick,
  tone = "normal",
  label,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "normal" | "strong" | "danger";
  label?: string;
  disabled?: boolean;
}) {
  const color =
    tone === "strong"
      ? "bg-sky-600 text-white hover:bg-sky-500"
      : tone === "danger"
        ? "bg-red-600/15 text-red-700 hover:bg-red-600/25 dark:text-red-300"
        : "bg-neutral-500/20 hover:bg-neutral-500/30";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={`min-h-10 rounded-lg px-3 text-sm whitespace-nowrap disabled:opacity-40 ${color}`}
    >
      {children}
    </button>
  );
}
