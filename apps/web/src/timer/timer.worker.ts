// エンジンのタイマーを回す専用 Worker (ADR-0013)。メインスレッドから { set, id, delayMs } / { clear, id } を受け、
// 予定を過ぎたら { fire, id } を返す。Worker の中の時計で待ち直すので、早く起きても早く知らせない
import { createWaiter } from "./wait.ts";

export type TimerRequest =
  { type: "set"; id: number; delayMs: number } | { type: "clear"; id: number };
export type TimerReply = { type: "fire"; id: number };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<TimerRequest>) => void) | null;
  postMessage: (reply: TimerReply) => void;
};

const waiter = createWaiter({
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id) => clearTimeout(id),
});

scope.onmessage = (e) => {
  const request = e.data;
  if (request.type === "set") {
    waiter.set(request.id, request.delayMs, () =>
      scope.postMessage({ type: "fire", id: request.id }),
    );
  } else {
    waiter.clear(request.id);
  }
};
