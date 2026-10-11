// 再生画面 (docs/design/05-ui.md)。戦闘中は一瞬しか見ないので、今のフェーズ・次のイベント・残り秒数を大きく出す
import type { Timeline } from "@timeline-call/script";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/context.tsx";
import type { MessageKey } from "../i18n/ja.ts";
import { formatClock, formatRemaining } from "./format.ts";
import { usePlayer } from "./use-player.ts";
import type { PlayerSettings } from "./use-player.ts";

const STOP_HOLD_MS = 1000;
const SYNC_BUTTONS = 3;

type Props = {
  timeline: Timeline;
  settings: PlayerSettings;
  countdownSeconds: number;
  nudgeMs: number;
  onTagsChange: (tags: readonly string[] | null) => void;
};

export function Player({ timeline, settings, countdownSeconds, nudgeMs, onTagsChange }: Props) {
  const { t } = useI18n();
  const player = usePlayer(timeline, settings);
  const s = player.snapshot;
  useShortcuts(player, nudgeMs);
  const eventName = (eventId: string) =>
    timeline.phases.flatMap((p) => p.events).find((e) => e.id === eventId)?.name ?? eventId;

  if (!s) return null;
  const flowing = s.state === "countdown" || s.state === "running" || s.state === "finished";
  const nextManual = s.nextManualPhase;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm opacity-70">{s.phase?.name}</p>
          <p className="text-sm" data-testid="state">
            {t(`state.${s.state}` as MessageKey)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-5xl tabular-nums" data-testid="clock">
            {formatClock(s.logicalMs)}
          </p>
          {s.phase && (
            <p className="font-mono text-xs opacity-60">
              {t("player.phaseTime", { time: formatClock(s.phase.phaseMs) })}
            </p>
          )}
        </div>
      </header>

      <TagChooser timeline={timeline} chosen={settings.chosenTags} onChange={onTagsChange} />
      {!player.speech && <Notice tone="info">{t("player.noSpeech")}</Notice>}
      {player.missed && <Notice tone="warn">{t("player.missed")}</Notice>}
      {player.banner && (
        <p
          role="alert"
          className="rounded-lg bg-amber-400 px-4 py-6 text-center text-4xl font-bold text-black"
        >
          {player.banner}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <h2 className="mb-1 text-xs opacity-60">{t("player.upcoming")}</h2>
        {s.upcoming.length === 0 ? (
          <p className="opacity-60">{t("player.nothingAhead")}</p>
        ) : (
          <ol className="flex flex-col gap-1" data-testid="upcoming">
            {s.upcoming.map((u, i) => (
              <li
                key={u.notification.id}
                className={`flex items-baseline gap-3 rounded px-2 py-1 ${i === 0 ? "bg-sky-500/15 text-xl" : ""}`}
              >
                <span className="w-14 shrink-0 text-right font-mono tabular-nums">
                  {formatRemaining(u.remainingMs)}
                </span>
                <span className="shrink-0 font-semibold">{eventName(u.notification.eventId)}</span>
                <span className="truncate opacity-80">「{u.notification.text}」</span>
                {u.notification.tags.length > 0 && (
                  <span className="ml-auto shrink-0 text-xs opacity-60">
                    {u.notification.tags.join(" ")}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        {player.recent.length > 0 && (
          <>
            <h2 className="mt-3 mb-1 text-xs opacity-60">{t("player.recent")}</h2>
            <ol className="flex flex-col gap-1 opacity-50">
              {player.recent.map((r, i) => (
                <li key={`${r.notification.id}-${i}`} className="flex gap-3 px-2">
                  <span className="w-14 shrink-0 text-right text-xs">
                    {t(r.result === "fired" ? "player.fired" : "player.skipped")}
                  </span>
                  <span>{eventName(r.notification.eventId)}</span>
                  <span className="truncate">「{r.notification.text}」</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      <nav className="flex flex-col gap-2" aria-label="controls">
        <div className="flex flex-wrap gap-2">
          {s.upcomingEvents
            .filter((e) => e.atMs !== null)
            .slice(0, SYNC_BUTTONS)
            .map((e) => (
              <Button
                key={e.event.id}
                onClick={() => player.syncTo(e.event.id)}
                disabled={!flowing}
              >
                {t("player.syncNow", { name: e.event.name })}
              </Button>
            ))}
          {nextManual && (
            <Button
              tone="strong"
              onClick={() => player.startPhase(nextManual.id)}
              disabled={s.state !== "running" && s.state !== "paused"}
            >
              {t("player.startPhase", { name: nextManual.name })}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => player.nudge(-nudgeMs)} disabled={s.state === "ready"}>
            {t("player.nudgeBack", { seconds: nudgeMs / 1000 })}
          </Button>
          <Button onClick={() => player.nudge(nudgeMs)} disabled={s.state === "ready"}>
            {t("player.nudgeForward", { seconds: nudgeMs / 1000 })}
          </Button>
          <Button onClick={player.undo} disabled={!s.canUndo}>
            {t("player.undo")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            tone="strong"
            onClick={() => player.startCountdown(countdownSeconds)}
            disabled={s.state !== "ready"}
          >
            {t("player.countdown", { seconds: countdownSeconds })}
          </Button>
          <Button onClick={player.start} disabled={s.state !== "ready" && s.state !== "countdown"}>
            {t("player.start")}
          </Button>
          {s.state === "paused" ? (
            <Button onClick={player.resume}>{t("player.resume")}</Button>
          ) : (
            <Button onClick={player.pause} disabled={!flowing}>
              {t("player.pause")}
            </Button>
          )}
          <HoldButton onHold={player.stop} disabled={s.state === "ready"}>
            {t("player.stop")}
          </HoldButton>
        </div>
      </nav>
    </section>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "normal" | "strong";
};

function Button({ children, onClick, disabled = false, tone = "normal" }: ButtonProps) {
  const color =
    tone === "strong"
      ? "bg-sky-600 text-white hover:bg-sky-500"
      : "bg-neutral-500/20 hover:bg-neutral-500/30";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-12 min-w-12 rounded-lg px-4 text-base disabled:opacity-40 ${color}`}
    >
      {children}
    </button>
  );
}

/** 押し間違えると何も鳴らなくなるので、停止は長押しにする (03、05) */
function HoldButton({
  children,
  onHold,
  disabled,
}: {
  children: ReactNode;
  onHold: () => void;
  disabled: boolean;
}) {
  const timer = useRef<number | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={() => {
        cancel();
        timer.current = window.setTimeout(onHold, STOP_HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      className="min-h-12 rounded-lg bg-red-600/80 px-4 text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone: "info" | "warn" }) {
  const color = tone === "warn" ? "bg-red-500/20" : "bg-neutral-500/15";
  return <p className={`rounded px-3 py-2 text-sm ${color}`}>{children}</p>;
}

/** 別モニタのブラウザに入力を戻したときだけ効く補助 (05 の「操作の割り当て」) */
function useShortcuts(player: ReturnType<typeof usePlayer>, nudgeMs: number) {
  const ref = useRef(player);
  ref.current = player;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const p = ref.current;
      if (e.key === " ") {
        e.preventDefault();
        if (p.snapshot?.state === "paused") p.resume();
        else p.pause();
      } else if (e.key === "ArrowLeft") p.nudge(-nudgeMs);
      else if (e.key === "ArrowRight") p.nudge(nudgeMs);
      else if (e.key === "z" || e.key === "Z") p.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudgeMs]);
}

/** 聞くタグ (要件 FR-006)。スクリプトがタグを持つときだけ出す。何も選んでいなければ全部 */
function TagChooser({
  timeline,
  chosen,
  onChange,
}: {
  timeline: Timeline;
  chosen: ReadonlySet<string> | null;
  onChange: (tags: readonly string[] | null) => void;
}) {
  const { t } = useI18n();
  const tags = timeline.metadata.tags;
  if (tags.length === 0) return null;
  const toggle = (id: string) => {
    const next = new Set(chosen ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next.size === 0 ? null : [...next]);
  };
  const chip = (active: boolean) =>
    `min-h-10 rounded-full px-3 text-sm ${active ? "bg-sky-600 text-white" : "bg-neutral-500/20"}`;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("player.tags")}>
      <span className="text-xs opacity-60">{t("player.tags")}</span>
      <button
        type="button"
        aria-pressed={chosen === null}
        className={chip(chosen === null)}
        onClick={() => onChange(null)}
      >
        {t("player.allTags")}
      </button>
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          aria-pressed={chosen?.has(tag.id) ?? false}
          className={chip(chosen?.has(tag.id) ?? false)}
          onClick={() => toggle(tag.id)}
        >
          {tag.label}
        </button>
      ))}
    </div>
  );
}
