// 設定の画面 (要件 8 章、docs/design/05-ui.md)。変えたらすぐ保存する
import { createWebSpeechProvider } from "@cueline/speech";
import { useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/context.tsx";
import type { MessageKey } from "../i18n/ja.ts";
import { useSettings } from "./context.tsx";
import type { Settings } from "./settings.ts";
import { useVoices } from "./use-voices.ts";

const TEST_TEXT: Record<"ja" | "en", { text: string; lang: string }> = {
  ja: { text: "5秒後、全体攻撃", lang: "ja-JP" },
  en: { text: "Raidwide in five seconds", lang: "en-US" },
};

export function SettingsView() {
  const { t, language } = useI18n();
  const { settings, update } = useSettings();
  const sample = TEST_TEXT[language];
  const voices = useVoices(sample.lang);
  const [testing, setTesting] = useState<string | null>(null);
  const setVoice = (change: Partial<Settings["voice"]>) =>
    update((s) => ({ ...s, voice: { ...s.voice, ...change } }));

  async function test() {
    if (!("speechSynthesis" in window)) return setTesting(t("player.noSpeech"));
    const provider = createWebSpeechProvider({
      synth: window.speechSynthesis,
      Utterance: window.SpeechSynthesisUtterance,
      settings: () => settings.voice,
      now: () => performance.now(),
    });
    setTesting(t("settings.testing"));
    const result = await provider.test(sample.text, sample.lang);
    if (!result.ok) return setTesting(t("settings.testFailed", { error: result.error }));
    update((s) => ({ ...s, latencyMs: Math.round(result.startLatencyMs) }));
    setTesting(t("settings.latency", { ms: Math.round(result.startLatencyMs) }));
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t("settings.title")}</h2>

      <Group title={t("settings.voiceGroup")}>
        <Field label={t("settings.voice")}>
          <select
            value={settings.voice.voiceURI ?? ""}
            onChange={(e) => setVoice({ voiceURI: e.target.value === "" ? null : e.target.value })}
            className="w-full rounded border border-neutral-500/30 bg-transparent p-2"
          >
            <option value="">{t("settings.voiceAuto")}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} [{v.lang}] {v.localService ? "" : t("settings.online")}
              </option>
            ))}
          </select>
        </Field>
        <Range
          label={t("settings.rate")}
          value={settings.voice.rate}
          min={0.5}
          max={2}
          step={0.1}
          onChange={(rate) => setVoice({ rate })}
        />
        <Range
          label={t("settings.volume")}
          value={settings.voice.volume}
          min={0}
          max={1}
          step={0.1}
          onChange={(volume) => setVoice({ volume })}
        />
        <Range
          label={t("settings.pitch")}
          value={settings.voice.pitch}
          min={0}
          max={2}
          step={0.1}
          onChange={(pitch) => setVoice({ pitch })}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={test}
            className="min-h-12 rounded-lg bg-sky-600 px-4 text-white hover:bg-sky-500"
          >
            {t("settings.test")}
          </button>
          <span className="text-sm" role="status">
            {testing}
          </span>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.compensateLatency}
            onChange={(e) => update((s) => ({ ...s, compensateLatency: e.target.checked }))}
          />
          {t("settings.compensate", {
            ms: settings.latencyMs === null ? "-" : String(settings.latencyMs),
          })}
        </label>
      </Group>

      <Group title={t("settings.playGroup")}>
        <Choice
          label={t("settings.conflict")}
          value={settings.conflict}
          options={["interrupt", "queue", "priority"] as const}
          labelOf={(v) => t(`settings.conflict.${v}` as MessageKey)}
          onChange={(conflict) => update((s) => ({ ...s, conflict }))}
        />
        <Choice
          label={t("settings.rewind")}
          value={settings.rewindPolicy}
          options={["by-operation", "keep", "rearm"] as const}
          labelOf={(v) => t(`settings.rewind.${v}` as MessageKey)}
          onChange={(rewindPolicy) => update((s) => ({ ...s, rewindPolicy }))}
        />
        <NumberField
          label={t("settings.countdown")}
          value={settings.countdownSeconds}
          min={1}
          max={60}
          step={1}
          onChange={(countdownSeconds) => update((s) => ({ ...s, countdownSeconds }))}
        />
        <NumberField
          label={t("settings.nudge")}
          value={settings.nudgeSeconds}
          min={0.1}
          max={10}
          step={0.1}
          onChange={(nudgeSeconds) => update((s) => ({ ...s, nudgeSeconds }))}
        />
        <NumberField
          label={t("settings.upcoming")}
          value={settings.upcomingCount}
          min={1}
          max={10}
          step={1}
          onChange={(upcomingCount) => update((s) => ({ ...s, upcomingCount }))}
        />
      </Group>
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-neutral-500/30 p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {children}
    </label>
  );
}

function Range(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={`${props.label}: ${props.value.toFixed(1)}`}>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </Field>
  );
}

/** 範囲の外の数は保存しない (設定の検証で既定値に戻されないように) */
function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={props.label}>
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step}
        defaultValue={props.value}
        onChange={(e) => {
          const v = Number(e.target.value);
          const integer = Number.isInteger(props.step);
          if (
            e.target.value !== "" &&
            v >= props.min &&
            v <= props.max &&
            (!integer || Number.isInteger(v))
          )
            props.onChange(v);
        }}
        className="w-32 rounded border border-neutral-500/30 bg-transparent p-2"
      />
    </Field>
  );
}

function Choice<V extends string>(props: {
  label: string;
  value: V;
  options: readonly V[];
  labelOf: (v: V) => string;
  onChange: (v: V) => void;
}) {
  return (
    <Field label={props.label}>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as V)}
        className="w-full rounded border border-neutral-500/30 bg-transparent p-2"
      >
        {props.options.map((o) => (
          <option key={o} value={o}>
            {props.labelOf(o)}
          </option>
        ))}
      </select>
    </Field>
  );
}
