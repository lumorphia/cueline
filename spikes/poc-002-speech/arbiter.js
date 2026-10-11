// Call Arbiter の下書き (docs/design/04-speech.md の「競合」)。DOM を使わない。
// mode: "interrupt" (中断) / "queue" (順番) / "priority" (優先度)

const RANK = { low: 0, normal: 1, high: 2 };

export function createArbiter({
  mode,
  provider,
  now,
  defer = (fn, ms) => setTimeout(fn, ms),
  restartDelayMs = 0, // cancel の後、次を話し始めるまでの間
  queueMax = 3,
  maxLateMs = 2000,
  onEvent = () => {},
}) {
  let current = null;
  let queue = [];
  let token = 0;

  const emit = (type, call, extra = {}) => onEvent({ type, call, at: now(), ...extra });

  function start(call) {
    const mine = ++token;
    current = call;
    emit("speak", call);
    provider.speak(call, {
      onStart: () => mine === token && emit("start", call),
      onEnd: () => {
        if (mine !== token) return;
        emit("end", call);
        current = null;
        next();
      },
      onError: (error) => {
        // 中断した古いコールの知らせは、記録だけして状態に触らない
        if (mine !== token) return emit("error-stale", call, { error });
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
    if (now() - head.dueAt > maxLateMs) {
      emit("late", head);
      return next();
    }
    start(head);
  }

  function interruptWith(call) {
    const old = current;
    token += 1; // 古いコールの知らせを無効にしてから cancel する
    current = null;
    emit("interrupted", old);
    provider.cancel();
    if (restartDelayMs > 0) defer(() => start(call), restartDelayMs);
    else start(call);
  }

  function speak(call) {
    if (!current) return start(call);
    if (mode === "interrupt") return interruptWith(call);
    if (mode === "priority") {
      if (RANK[call.priority] >= RANK[current.priority]) return interruptWith(call);
      return emit("dropped", call, { reason: "priority" });
    }
    // queue
    const waiting = [...queue, call];
    const overflow = waiting.slice(0, Math.max(0, waiting.length - queueMax));
    overflow.forEach((c) => emit("dropped", c, { reason: "queue-full" }));
    queue = waiting.slice(overflow.length);
  }

  function cancelAll() {
    token += 1;
    queue.forEach((c) => emit("dropped", c, { reason: "cancel" }));
    queue = [];
    current = null;
    provider.cancel();
  }

  return { speak, cancelAll, current: () => current };
}
