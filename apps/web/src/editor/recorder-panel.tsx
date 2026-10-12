// 記録して作る画面 (要件 FR-008、05 の「記録して作る」)。動画や実戦に合わせて時計を動かし、
// ギミックが来た瞬間に「いま」を押す。名前とコールは後でエディタの表で直す。ゲームには触れない
import type { Script } from "@cueline/script";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/context.tsx";
import { formatClock } from "../player/format.ts";
import { sortEvents } from "./draft.ts";
import { SelectField, SmallButton } from "./fields.tsx";
import { applyRecording, createRecorder } from "./recorder.ts";
import { formatTime } from "./time-input.ts";

type Props = { script: Script; onDone: (script: Script) => void; onCancel: () => void };

export function RecorderPanel({ script, onDone, onCancel }: Props) {
  const { t } = useI18n();
  const recorder = useRef(createRecorder(() => performance.now())).current;
  const [target, setTarget] = useState(0);
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  const countdown = script.countdown?.default ?? 15;

  // 時計の表示を動かす
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      refresh();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const stamp = () => {
    recorder.stamp();
    refresh();
  };

  // Space でも「いま」を押せる (動画を見ながら)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key !== " " ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      e.preventDefault();
      stamp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // recorder と setTick は変わらないので、付けるのは 1 回でよい
  }, []);

  const finish = () => {
    const recorded = recorder.result();
    const applied = applyRecording(script, target, recorded);
    onDone(sortEvents(applied, target));
  };

  const clock = recorder.clock();
  const running = recorder.running();
  const recorded = recorder.result();
  const targetName = script.phases[target]?.name ?? "";

  return (
    <section className="flex flex-col gap-4" data-testid="recorder">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold">{t("recorder.title")}</h2>
        <SmallButton tone="strong" onClick={finish}>
          {t("recorder.finish")}
        </SmallButton>
        <SmallButton onClick={onCancel}>{t("recorder.cancel")}</SmallButton>
      </div>
      <p className="text-sm opacity-70">{t("recorder.hint")}</p>

      {!running && (
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            label={t("recorder.target")}
            value={String(target)}
            options={script.phases.map((p, i) => ({ value: String(i), label: p.name }))}
            onChange={(v) => setTarget(Number(v))}
          />
          <SmallButton
            tone="strong"
            onClick={() => (recorder.startCountdown(countdown), refresh())}
          >
            {t("player.countdown", { seconds: countdown })}
          </SmallButton>
          <SmallButton onClick={() => (recorder.start(), refresh())}>
            {t("player.start")}
          </SmallButton>
        </div>
      )}

      <div className="flex items-baseline justify-between">
        <span className="text-sm opacity-70" data-testid="recorder-phase">
          {clock.phase === 0 ? targetName : t("recorder.newPhase", { n: clock.phase })}
        </span>
        <span className="font-mono text-5xl tabular-nums" data-testid="recorder-clock">
          {formatClock(clock.phaseTime * 1000)}
        </span>
      </div>

      <button
        type="button"
        onClick={stamp}
        disabled={!running}
        className="min-h-32 rounded-2xl bg-sky-600 text-4xl font-bold text-white hover:bg-sky-500 disabled:opacity-40"
      >
        {t("recorder.now")}
      </button>

      <div className="grid grid-cols-2 gap-2">
        <SmallButton onClick={() => (recorder.nextPhase(), refresh())} disabled={!running}>
          {t("recorder.nextPhase")}
        </SmallButton>
        <SmallButton onClick={() => (recorder.undo(), refresh())}>{t("player.undo")}</SmallButton>
      </div>

      <ol className="flex flex-col gap-1 text-sm" data-testid="recorded">
        {recorded.map((phase, i) => (
          <li key={i}>
            <span className="opacity-60">
              {i === 0 ? targetName : t("recorder.newPhase", { n: i })}:{" "}
            </span>
            {phase.stamps.length === 0 ? "-" : phase.stamps.map(formatTime).join(" / ")}
          </li>
        ))}
      </ol>
    </section>
  );
}
