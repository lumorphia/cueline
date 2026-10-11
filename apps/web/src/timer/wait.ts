// Worker の中で使う待ち方 (ADR-0013)。setTimeout が予定より早く起きたら、残りを待ち直してから知らせる
type Timers = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
};

export function createWaiter(timers: Timers) {
  const handles = new Map<number, number>();

  function wait(id: number, target: number, callback: () => void) {
    const remaining = target - timers.now();
    if (remaining <= 0) {
      handles.delete(id);
      callback();
      return;
    }
    handles.set(
      id,
      timers.setTimeout(() => wait(id, target, callback), remaining),
    );
  }

  return {
    set(id: number, delayMs: number, callback: () => void) {
      wait(id, timers.now() + delayMs, callback);
    },
    clear(id: number) {
      const handle = handles.get(id);
      if (handle !== undefined) timers.clearTimeout(handle);
      handles.delete(id);
    },
  };
}
