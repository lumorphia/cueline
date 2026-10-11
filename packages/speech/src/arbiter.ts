// コールの競合 (docs/design/04-speech.md の「競合」、要件 FR-205)。PoC-002 の下書き (spikes/poc-002-speech) を移したもの。
// 中断された読み上げの知らせは次の読み上げを始めた後に届くので、今のコールの知らせでなければ読み捨てる
import type { Call, SpeechProvider } from "./provider.ts";

export type ConflictMode = "interrupt" | "queue" | "priority";

export type ArbiterEvent = {
  type: "speak" | "start" | "end" | "error" | "interrupted" | "dropped" | "late";
  call: Call;
  at: number;
  reason?: "priority" | "queue-full" | "cancel";
  error?: string;
};

export type ArbiterOptions = {
  mode: ConflictMode;
  provider: SpeechProvider;
  now: () => number;
  /** cancel の後、次を話し始めるまでの間 (ms)。PoC-002 で PC の Chrome は 0 でよかった */
  restartDelayMs?: number;
  defer?: (fn: () => void, ms: number) => void;
  /** 順番の待ち行列の長さ */
  queueMax?: number;
  /** 順番で、予定からこれ以上遅れたものは鳴らさない */
  maxLateMs?: number;
  onEvent?: (event: ArbiterEvent) => void;
};

const RANK = { low: 0, normal: 1, high: 2 } as const;

export type Arbiter = {
  speak(call: Call): void;
  cancelAll(): void;
  current(): Call | null;
};

export function createArbiter(options: ArbiterOptions): Arbiter {
  const { mode, provider, now } = options;
  const restartDelayMs = options.restartDelayMs ?? 0;
  const defer = options.defer ?? ((fn, ms) => void setTimeout(fn, ms));
  const queueMax = options.queueMax ?? 3;
  const maxLateMs = options.maxLateMs ?? 2000;
  let current: Call | null = null;
  let queue: readonly Call[] = [];
  let token = 0;

  const emit = (type: ArbiterEvent["type"], call: Call, extra: Partial<ArbiterEvent> = {}) =>
    options.onEvent?.({ type, call, at: now(), ...extra });

  function start(call: Call) {
    const mine = ++token;
    current = call;
    emit("speak", call);
    provider.speak(call, {
      onStart: () => {
        if (mine === token) emit("start", call);
      },
      onEnd: () => {
        if (mine !== token) return;
        emit("end", call);
        current = null;
        next();
      },
      onError: (error) => {
        if (mine !== token) return;
        emit("error", call, { error });
        current = null;
        next();
      },
    });
  }

  function next() {
    const [head, ...rest] = queue;
    queue = rest;
    if (!head) return;
    if (now() - head.dueAtMono > maxLateMs) {
      emit("late", head);
      next();
      return;
    }
    start(head);
  }

  function interruptWith(call: Call) {
    const old = current;
    token += 1; // 古いコールの知らせを無効にしてから cancel する
    current = null;
    if (old) emit("interrupted", old);
    provider.cancel();
    if (restartDelayMs > 0) defer(() => start(call), restartDelayMs);
    else start(call);
  }

  return {
    speak(call) {
      if (!current) return start(call);
      if (mode === "interrupt") return interruptWith(call);
      if (mode === "priority") {
        if (RANK[call.priority] >= RANK[current.priority]) return interruptWith(call);
        return emit("dropped", call, { reason: "priority" });
      }
      const waiting = [...queue, call];
      const overflow = waiting.slice(0, Math.max(0, waiting.length - queueMax));
      overflow.forEach((c) => emit("dropped", c, { reason: "queue-full" }));
      queue = waiting.slice(overflow.length);
    },
    cancelAll() {
      token += 1;
      queue.forEach((c) => emit("dropped", c, { reason: "cancel" }));
      queue = [];
      current = null;
      provider.cancel();
    },
    current: () => current,
  };
}
