// エンジンに渡すタイマー (ADR-0013)。Worker の中で待ち、起きたらメインスレッドで callback を呼ぶ
import type { Timer, TimerHandle } from "@timeline-call/engine";
import { scriptUrl } from "../trusted-types.ts";
import type { TimerReply, TimerRequest } from "./timer.worker.ts";
import workerUrl from "./timer.worker.ts?worker&url";

export function createWorkerTimer(): Timer & { dispose(): void } {
  const worker = new Worker(scriptUrl(workerUrl) as unknown as string, { type: "module" });
  const callbacks = new Map<number, () => void>();
  let nextId = 1;
  const send = (request: TimerRequest) => worker.postMessage(request);
  worker.onmessage = (e: MessageEvent<TimerReply>) => {
    const callback = callbacks.get(e.data.id);
    callbacks.delete(e.data.id);
    callback?.();
  };
  return {
    set(callback, delayMs): TimerHandle {
      const id = nextId++;
      callbacks.set(id, callback);
      send({ type: "set", id, delayMs });
      return id;
    },
    clear(handle) {
      const id = handle as number;
      callbacks.delete(id);
      send({ type: "clear", id });
    },
    dispose: () => worker.terminate(),
  };
}
