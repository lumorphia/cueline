// 再生のつなぎ (docs/design/01-architecture.md の「データの流れ」)。エンジン、読み上げ、Worker のタイマーを組み立て、
// 画面にはスナップショットを requestAnimationFrame ごとに渡す
import { createEngine } from "@timeline-call/engine";
import type { Engine, EngineSnapshot, RewindPolicy } from "@timeline-call/engine";
import type { Timeline, TimelineNotification } from "@timeline-call/script";
import { createArbiter, createWebSpeechProvider, unlockAudio } from "@timeline-call/speech";
import type { Arbiter, ConflictMode, VoiceSettings } from "@timeline-call/speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { createWorkerTimer } from "../timer/worker-timer.ts";
import { shouldPlay } from "./tag-filter.ts";

export type PlayerSettings = {
  conflict: ConflictMode;
  rewindPolicy: RewindPolicy;
  voice: VoiceSettings;
  /** 聞くタグ。null は全部 */
  chosenTags: ReadonlySet<string> | null;
  /** 何 ms 早く話し始めるか (テスト再生で測った立ち上がりの遅れ) */
  lookaheadMs: number;
  upcomingCount: number;
};

export type RecentCall = { notification: TimelineNotification; result: "fired" | "skipped" };

const DISPLAY_MS = 3000;

const speechAvailable = () =>
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  "SpeechSynthesisUtterance" in window;

export function usePlayer(timeline: Timeline, settings: PlayerSettings) {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [banner, setBanner] = useState<{ text: string; until: number } | null>(null);
  const [missed, setMissed] = useState(false);
  const [recent, setRecent] = useState<readonly RecentCall[]>([]);
  const engineRef = useRef<Engine | null>(null);
  const arbiterRef = useRef<Arbiter | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  // 設定は再生を作り直さずに変えられるように、ref から読む
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const timer = createWorkerTimer();
    const provider = speechAvailable()
      ? createWebSpeechProvider({
          synth: window.speechSynthesis,
          Utterance: window.SpeechSynthesisUtterance,
          settings: () => settingsRef.current.voice,
          now: () => performance.now(),
        })
      : null;
    const arbiter = provider
      ? createArbiter({ mode: settings.conflict, provider, now: () => performance.now() })
      : null;
    const remember = (notification: TimelineNotification, result: RecentCall["result"]) =>
      setRecent((list) => [{ notification, result }, ...list].slice(0, 3));

    const engine = createEngine({
      timeline,
      clock: { now: () => performance.now() },
      timer,
      rewindPolicy: settings.rewindPolicy,
      lookaheadMs: settings.lookaheadMs,
      onFire(notification, dueAtMono) {
        if (!shouldPlay(notification, settingsRef.current.chosenTags)) return;
        remember(notification, "fired");
        if (notification.type === "display") {
          setBanner({ text: notification.text, until: performance.now() + DISPLAY_MS });
          return;
        }
        arbiter?.speak({
          id: notification.id,
          text: notification.text,
          language: timeline.metadata.language,
          priority: notification.priority,
          dueAtMono,
        });
      },
      onMissed(notifications) {
        setMissed(true);
        notifications.forEach((n) => remember(n, "skipped"));
      },
    });
    engineRef.current = engine;
    arbiterRef.current = arbiter;

    let frame = 0;
    const tick = () => {
      setSnapshot(engine.snapshot(settingsRef.current.upcomingCount));
      setBanner((b) => (b && b.until < performance.now() ? null : b));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onVisible = () => {
      if (document.visibilityState === "visible") engine.process();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisible);
      engine.stop();
      arbiter?.cancelAll();
      timer.dispose();
      engineRef.current = null;
      arbiterRef.current = null;
    };
    // 競合の方式、戻し方、先に話す時間はエンジンと Arbiter を作るときに決まる。変わったら作り直す
  }, [timeline, settings.conflict, settings.rewindPolicy, settings.lookaheadMs]);

  /** スマホの音のアンロック (ADR-0009)。ボタンの押下の中で呼ぶ */
  const unlock = useCallback(() => {
    if (!speechAvailable()) return;
    void unlockAudio({
      synth: window.speechSynthesis,
      Utterance: window.SpeechSynthesisUtterance,
      AudioContext: window.AudioContext,
      ...(audioRef.current ? { context: audioRef.current } : {}),
    }).then(({ context }) => {
      audioRef.current = context as AudioContext;
    });
  }, []);

  const act = useCallback(
    (fn: (engine: Engine) => void, options: { unlock?: boolean } = {}) => {
      if (options.unlock) unlock();
      const engine = engineRef.current;
      if (engine) fn(engine);
    },
    [unlock],
  );

  return {
    snapshot,
    banner: banner?.text ?? null,
    missed,
    recent,
    speech: speechAvailable(),
    startCountdown: (seconds: number) => act((e) => e.startCountdown(seconds), { unlock: true }),
    start: () => act((e) => e.start(), { unlock: true }),
    pause: () => act((e) => e.pause()),
    resume: () => act((e) => e.resume(), { unlock: true }),
    stop: () => {
      act((e) => e.stop());
      arbiterRef.current?.cancelAll();
      setRecent([]);
      setMissed(false);
    },
    nudge: (deltaMs: number) => act((e) => e.nudge(deltaMs)),
    syncTo: (eventId: string) => {
      act((e) => e.syncTo(eventId));
      setMissed(false);
    },
    startPhase: (phaseId: string) => act((e) => e.startPhase(phaseId)),
    undo: () => act((e) => e.undo()),
  };
}
