// エンジン (docs/design/03-engine.md、ADR-0006、ADR-0008)。DOM を使わない。
// 論理時刻は毎回時計から計算し、タイマーは「次に知らせる時刻まで」の 1 本だけを張る
import type {
  NotificationId,
  Timeline,
  TimelineEvent,
  TimelineNotification,
} from "@timeline-call/script";

export type Clock = { now(): number };
export type TimerHandle = unknown;
export type Timer = {
  set(callback: () => void, delayMs: number): TimerHandle;
  clear(handle: TimerHandle): void;
};

export type EngineState = "ready" | "countdown" | "running" | "paused" | "finished";
export type RewindPolicy = "by-operation" | "keep" | "rearm";

export type EngineOptions = {
  timeline: Timeline;
  clock: Clock;
  timer: Timer;
  /** 何 ms 前に知らせるか。Web Speech は 0、作ってから鳴らす型は 300 など (04) */
  lookaheadMs?: number;
  /** これより遅れて気づいた通知は鳴らさない (仮の値 2000、ADR-0013) */
  lateToleranceMs?: number;
  /** 時刻を戻したときの鳴らし済みの扱い (仮の既定 by-operation、RM-32) */
  rewindPolicy?: RewindPolicy;
  onFire?: (notification: TimelineNotification, dueAtMono: number) => void;
  onMissed?: (notifications: readonly TimelineNotification[], lateMs: number) => void;
  onStateChange?: (state: EngineState) => void;
};

export type UpcomingNotification = {
  notification: TimelineNotification;
  fireAtMs: number;
  remainingMs: number;
};

export type UpcomingEvent = {
  event: TimelineEvent;
  phaseId: string;
  /** まだ始まっていない manual のフェーズのイベントは null */
  atMs: number | null;
  remainingMs: number | null;
};

export type EngineSnapshot = {
  state: EngineState;
  logicalMs: number;
  phase: { id: string; name: string; phaseMs: number } | null;
  upcoming: readonly UpcomingNotification[];
  upcomingEvents: readonly UpcomingEvent[];
  fired: ReadonlySet<NotificationId>;
  skipped: ReadonlySet<NotificationId>;
  canUndo: boolean;
};

export type Engine = {
  startCountdown(seconds: number): void;
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  restart(): void;
  seek(logicalMs: number): void;
  nudge(deltaMs: number): void;
  syncTo(eventId: string): void;
  startPhase(phaseId: string): void;
  undo(): void;
  /** タイマーを待たずに、今の時刻までに来ている通知を処理する (見えるようになったときなど) */
  process(): void;
  snapshot(count?: number): EngineSnapshot;
};

type Entry = { notification: TimelineNotification; phaseIndex: number; order: number };
type CorrectionKind = "seek" | "nudge" | "sync" | "phase";
type UndoRecord = {
  deltaMs: number;
  manualStarts: ReadonlyMap<string, number>;
  skipped: ReadonlySet<NotificationId>;
};

type Core = {
  state: EngineState;
  pausedFrom: EngineState | null;
  anchor: { logical: number; mono: number };
  /** 始まった manual のフェーズと、その開始の論理時刻 */
  manualStarts: ReadonlyMap<string, number>;
  fired: ReadonlySet<NotificationId>;
  skipped: ReadonlySet<NotificationId>;
  undo: UndoRecord | null;
};

const FLOWING: readonly EngineState[] = ["countdown", "running", "finished"];
const CORRECTABLE: readonly EngineState[] = ["countdown", "running", "paused", "finished"];

export function createEngine(options: EngineOptions): Engine {
  const { timeline, clock, timer } = options;
  const lookaheadMs = options.lookaheadMs ?? 0;
  const lateToleranceMs = options.lateToleranceMs ?? 2000;
  const rewindPolicy = options.rewindPolicy ?? "by-operation";
  const phases = timeline.phases;
  const phaseIndexOf = new Map(phases.map((p, i) => [p.id, i]));
  const entries: readonly Entry[] = phases
    .flatMap((phase, phaseIndex) =>
      phase.notifications.map((notification) => ({ notification, phaseIndex, order: 0 })),
    )
    .map((entry, order) => ({ ...entry, order }));

  const fresh = (): Core => ({
    state: "ready",
    pausedFrom: null,
    anchor: { logical: 0, mono: clock.now() },
    manualStarts: new Map(),
    fired: new Set(),
    skipped: new Set(),
    undo: null,
  });

  let core = fresh();
  let handle: TimerHandle | null = null;

  // --- 時刻とフェーズ ---

  const logicalOf = (c: Core, now: number) =>
    FLOWING.includes(c.state) ? c.anchor.logical + (now - c.anchor.mono) : c.anchor.logical;

  function phaseStart(c: Core, phaseIndex: number): number | null {
    const phase = phases[phaseIndex];
    if (!phase) return null;
    return phase.start.type === "absolute"
      ? phase.start.atMs
      : (c.manualStarts.get(phase.id) ?? null);
  }

  /** 始まった manual のフェーズのうち一番後ろの位置。それより前のフェーズの残りは鳴らさない */
  const latestManual = (c: Core) =>
    Math.max(-1, ...[...c.manualStarts.keys()].map((id) => phaseIndexOf.get(id) ?? -1));

  function fireAt(c: Core, entry: Entry): number | null {
    if (!entry.notification.enabled || entry.phaseIndex < latestManual(c)) return null;
    const start = phaseStart(c, entry.phaseIndex);
    return start === null ? null : start + entry.notification.fireAtPhaseMs;
  }

  /** 鳴らす予定の通知 (時刻順、同じ時刻はタイムラインの順) */
  function pendingOf(c: Core): { entry: Entry; at: number }[] {
    return entries
      .flatMap((entry) => {
        const at = fireAt(c, entry);
        const id = entry.notification.id;
        return at === null || c.fired.has(id) || c.skipped.has(id) ? [] : [{ entry, at }];
      })
      .sort((a, b) => a.at - b.at || a.entry.order - b.entry.order);
  }

  function currentPhaseIndex(c: Core, t: number): number {
    const manual = latestManual(c);
    if (manual >= 0) return manual;
    const started = phases.flatMap((p, i) =>
      p.start.type === "absolute" && p.start.atMs <= t ? [i] : [],
    );
    return started.at(-1) ?? 0;
  }

  /** まだ始まっていない manual のフェーズが、今のフェーズより後に残っているか */
  const hasManualAhead = (c: Core, t: number) =>
    phases.some(
      (p, i) =>
        p.start.type === "manual" && i > currentPhaseIndex(c, t) && !c.manualStarts.has(p.id),
    );

  // --- 状態の更新 ---

  function commit(next: Core) {
    const before = core.state;
    core = next;
    if (next.state !== before) options.onStateChange?.(next.state);
  }

  function clearTimer() {
    if (handle !== null) timer.clear(handle);
    handle = null;
  }

  function process() {
    clearTimer();
    if (!FLOWING.includes(core.state)) return;
    const now = clock.now();
    const t = logicalOf(core, now);
    const state = core.state === "countdown" && t >= 0 ? "running" : core.state;
    const due = pendingOf(core).filter((p) => p.at <= t + lookaheadMs);
    const missed = due.filter((p) => t - p.at > lateToleranceMs);
    const fire = due.filter((p) => t - p.at <= lateToleranceMs);
    const anchor = core.anchor;
    commit({
      ...core,
      state,
      fired: new Set([...core.fired, ...fire.map((p) => p.entry.notification.id)]),
      skipped: new Set([...core.skipped, ...missed.map((p) => p.entry.notification.id)]),
    });
    for (const p of fire) {
      options.onFire?.(p.entry.notification, anchor.mono + (p.at - anchor.logical));
    }
    if (missed.length > 0) {
      options.onMissed?.(
        missed.map((p) => p.entry.notification),
        Math.max(...missed.map((p) => t - p.at)),
      );
    }
    settle();
  }

  /** 終わったかどうかを決め、次のタイマーを張る */
  function settle() {
    if (!FLOWING.includes(core.state)) return;
    const t = logicalOf(core, clock.now());
    const pending = pendingOf(core);
    const done = pending.length === 0 && !hasManualAhead(core, t);
    if (core.state === "running" && done) commit({ ...core, state: "finished" });
    if (core.state === "finished" && !done) commit({ ...core, state: "running" });
    const next = [
      ...pending.map((p) => p.at - lookaheadMs),
      ...(core.state === "countdown" ? [0] : []),
    ];
    if (next.length === 0) return;
    handle = timer.set(process, Math.max(0, Math.min(...next) - t));
  }

  // --- 補正 ---

  /** 補正の後の状態。カウント中か戦闘中かは時刻の符号で決まり、一時停止は一時停止のまま */
  function stateAfter(c: Core, target: number): Pick<Core, "state" | "pausedFrom"> {
    const flowing: EngineState = target < 0 ? "countdown" : "running";
    return c.state === "paused"
      ? { state: "paused", pausedFrom: flowing }
      : { state: flowing, pausedFrom: null };
  }

  function correct(
    kind: CorrectionKind,
    target: number,
    manualStarts?: ReadonlyMap<string, number>,
  ) {
    if (!CORRECTABLE.includes(core.state)) return;
    const now = clock.now();
    const t = logicalOf(core, now);
    const starts =
      manualStarts ?? new Map([...core.manualStarts].filter(([, start]) => start <= target));
    // 始まっていないことに戻ったフェーズの通知は、まっさらにする
    const unstarted = new Set([...core.manualStarts.keys()].filter((id) => !starts.has(id)));
    const inUnstarted = (id: NotificationId) =>
      entries.some(
        (e) => e.notification.id === id && unstarted.has(phases[e.phaseIndex]?.id ?? ""),
      );
    const base: Core = {
      ...core,
      ...stateAfter(core, target),
      anchor: { logical: target, mono: now },
      manualStarts: starts,
      fired: new Set([...core.fired].filter((id) => !inUnstarted(id))),
      skipped: new Set([...core.skipped].filter((id) => !inUnstarted(id))),
      undo: { deltaMs: target - t, manualStarts: core.manualStarts, skipped: core.skipped },
    };
    commit(target >= t ? skipUntil(base, target) : rewind(base, target, kind));
    process();
  }

  /** 飛び越えた通知は鳴らさずに skipped にする (要件 FR-105) */
  function skipUntil(c: Core, target: number): Core {
    const jumped = pendingOf(c).filter((p) => p.at <= target);
    return {
      ...c,
      skipped: new Set([...c.skipped, ...jumped.map((p) => p.entry.notification.id)]),
    };
  }

  /** 戻したとき、戻した先より後を未実行に戻すか (rewindPolicy、03 の「戻したとき」) */
  function rewind(c: Core, target: number, kind: CorrectionKind): Core {
    const rearm = rewindPolicy === "rearm" || (rewindPolicy === "by-operation" && kind === "seek");
    if (!rearm) return c;
    const later = new Set(
      entries.filter((e) => (fireAt(c, e) ?? -Infinity) > target).map((e) => e.notification.id),
    );
    return {
      ...c,
      fired: new Set([...c.fired].filter((id) => !later.has(id))),
      skipped: new Set([...c.skipped].filter((id) => !later.has(id))),
    };
  }

  const now = () => logicalOf(core, clock.now());

  function syncTo(eventId: string) {
    const phaseIndex = phases.findIndex((p) => p.events.some((e) => e.id === eventId));
    const phase = phases[phaseIndex];
    const event = phase?.events.find((e) => e.id === eventId);
    if (!phase || !event) return;
    const start = phaseStart(core, phaseIndex);
    if (start !== null) return correct("sync", start + event.atPhaseMs);
    // まだ始まっていない manual のフェーズ: 今がそのイベントの時刻になるように、フェーズを始めたことにする
    const t = now();
    const starts = new Map([
      ...[...core.manualStarts].filter(([id]) => (phaseIndexOf.get(id) ?? 0) < phaseIndex),
      [phase.id, t - event.atPhaseMs] as const,
    ]);
    correct("sync", t, starts);
  }

  function startPhase(phaseId: string) {
    const phaseIndex = phaseIndexOf.get(phaseId);
    const phase = phaseIndex === undefined ? undefined : phases[phaseIndex];
    if (!phase || phaseIndex === undefined || core.state === "countdown") return;
    if (phase.start.type === "absolute") return correct("seek", phase.start.atMs);
    const t = now();
    const starts = new Map([
      ...[...core.manualStarts].filter(([id]) => (phaseIndexOf.get(id) ?? 0) < phaseIndex),
      [phaseId, t] as const,
    ]);
    correct("phase", t, starts);
  }

  function undo() {
    const record = core.undo;
    if (!record || !CORRECTABLE.includes(core.state)) return;
    const clockNow = clock.now();
    const target = logicalOf(core, clockNow) - record.deltaMs;
    commit({
      ...core,
      ...stateAfter(core, target),
      anchor: { logical: target, mono: clockNow },
      manualStarts: record.manualStarts,
      skipped: new Set([...record.skipped].filter((id) => !core.fired.has(id))),
      undo: null,
    });
    process();
  }

  // --- スナップショット ---

  function snapshot(count = 5): EngineSnapshot {
    const t = now();
    const index = currentPhaseIndex(core, t);
    const phase = phases[index];
    const start = phaseStart(core, index);
    const latest = latestManual(core);
    const knownEvents = phases.flatMap((p, i) => {
      const s = phaseStart(core, i);
      if (i < latest || s === null) return [];
      return p.events
        .filter((e) => s + e.atPhaseMs > t)
        .map((e) => ({
          event: e,
          phaseId: p.id,
          atMs: s + e.atPhaseMs,
          remainingMs: s + e.atPhaseMs - t,
        }));
    });
    const nextManual = phases.find(
      (p, i) => i > index && p.start.type === "manual" && !core.manualStarts.has(p.id),
    );
    const manualEvents = (nextManual?.events ?? []).map((e) => ({
      event: e,
      phaseId: nextManual?.id ?? "",
      atMs: null,
      remainingMs: null,
    }));
    return {
      state: core.state,
      logicalMs: t,
      phase: phase ? { id: phase.id, name: phase.name, phaseMs: t - (start ?? 0) } : null,
      upcoming: pendingOf(core)
        .slice(0, count)
        .map((p) => ({
          notification: p.entry.notification,
          fireAtMs: p.at,
          remainingMs: p.at - t,
        })),
      upcomingEvents: [...[...knownEvents].sort((a, b) => a.atMs - b.atMs), ...manualEvents].slice(
        0,
        count,
      ),
      fired: core.fired,
      skipped: core.skipped,
      canUndo: core.undo !== null,
    };
  }

  // --- 操作 ---

  return {
    startCountdown(seconds) {
      if (core.state !== "ready") return;
      commit({
        ...fresh(),
        state: "countdown",
        anchor: { logical: -seconds * 1000, mono: clock.now() },
      });
      process();
    },
    start() {
      if (core.state !== "ready" && core.state !== "countdown") return;
      // カウント中に押したら、そこを 0 にする。残りのカウント中の通知は鳴らさない
      const started: Core = {
        ...core,
        state: "running",
        anchor: { logical: 0, mono: clock.now() },
      };
      const early = pendingOf(started).filter((p) => p.at < 0);
      commit({
        ...started,
        skipped: new Set([...started.skipped, ...early.map((p) => p.entry.notification.id)]),
      });
      process();
    },
    pause() {
      if (!FLOWING.includes(core.state)) return;
      clearTimer();
      commit({
        ...core,
        state: "paused",
        pausedFrom: core.state,
        anchor: { logical: now(), mono: clock.now() },
      });
    },
    resume() {
      if (core.state !== "paused") return;
      commit({
        ...core,
        state: core.pausedFrom ?? "running",
        pausedFrom: null,
        anchor: { logical: core.anchor.logical, mono: clock.now() },
      });
      process();
    },
    stop() {
      clearTimer();
      commit(fresh());
    },
    restart() {
      clearTimer();
      commit(fresh());
    },
    seek: (logicalMs) => correct("seek", logicalMs),
    nudge: (deltaMs) => correct("nudge", now() + deltaMs),
    syncTo,
    startPhase,
    undo,
    process,
    snapshot,
  };
}
