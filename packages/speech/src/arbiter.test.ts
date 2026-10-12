import { describe, expect, it } from "vitest";
import { createArbiter } from "./arbiter.ts";
import type { ArbiterEvent, ConflictMode } from "./arbiter.ts";
import type { Call, ProviderCallbacks, SpeechProvider } from "./provider.ts";
import type { Priority } from "@cueline/script";

// 偽のプロバイダ。話したものを覚え、終わらせるのはテストが行う。
// cancel した読み上げの interrupted は、実際のブラウザと同じく後から届く (deliverCancelled で届ける。PoC-002)
function fakeProvider() {
  const spoken: string[] = [];
  let current: { call: Call; callbacks: ProviderCallbacks } | null = null;
  let cancelled: ProviderCallbacks[] = [];
  const provider: SpeechProvider = {
    speak(call, callbacks) {
      spoken.push(call.id);
      current = { call, callbacks };
      callbacks.onStart();
    },
    cancel() {
      if (current) cancelled = [...cancelled, current.callbacks];
      current = null;
    },
  };
  const finish = () => {
    const c = current;
    current = null;
    c?.callbacks.onEnd();
  };
  const fail = (error: string) => {
    const c = current;
    current = null;
    c?.callbacks.onError(error);
  };
  const deliverCancelled = () => {
    const late = cancelled;
    cancelled = [];
    late.forEach((c) => c.onError("interrupted"));
  };
  return { provider, spoken, finish, fail, deliverCancelled };
}

function setup(mode: ConflictMode, extra: { restartDelayMs?: number } = {}) {
  const fake = fakeProvider();
  let t = 0;
  const deferred: (() => void)[] = [];
  const events: string[] = [];
  const arbiter = createArbiter({
    mode,
    provider: fake.provider,
    now: () => t,
    defer: (fn) => deferred.push(fn),
    onEvent: (e: ArbiterEvent) => events.push(`${e.type}:${e.call.id}`),
    ...extra,
  });
  return {
    ...fake,
    arbiter,
    events,
    advance: (ms: number) => (t += ms),
    runDeferred: () => deferred.splice(0).forEach((fn) => fn()),
  };
}

const call = (id: string, priority: Priority = "normal", dueAtMono = 0): Call => ({
  id,
  text: id,
  language: "ja-JP",
  priority,
  dueAtMono,
});

describe("interrupt", () => {
  it("cancels the current call and speaks the new one", () => {
    const { spoken, arbiter, events } = setup("interrupt");
    arbiter.speak(call("a"));
    arbiter.speak(call("b"));
    expect(spoken).toEqual(["a", "b"]);
    expect(events).toContain("interrupted:a");
  });

  it("ignores the late error of an interrupted call", () => {
    const { arbiter, events, deliverCancelled } = setup("interrupt");
    arbiter.speak(call("a"));
    arbiter.speak(call("b"));
    deliverCancelled();
    expect(events.filter((e) => e.startsWith("error"))).toEqual([]);
    expect(arbiter.current()?.id).toBe("b");
  });

  it("ignores the late error of an interrupted call while waiting the restart delay", () => {
    const { arbiter, events, deliverCancelled, runDeferred, spoken } = setup("interrupt", {
      restartDelayMs: 100,
    });
    arbiter.speak(call("a"));
    arbiter.speak(call("b"));
    deliverCancelled();
    runDeferred();
    expect(events.filter((e) => e.startsWith("error"))).toEqual([]);
    expect(spoken).toEqual(["a", "b"]);
  });

  it("waits the restart delay before speaking after a cancel", () => {
    const { spoken, arbiter, runDeferred } = setup("interrupt", { restartDelayMs: 100 });
    arbiter.speak(call("a"));
    arbiter.speak(call("b"));
    expect(spoken).toEqual(["a"]);
    runDeferred();
    expect(spoken).toEqual(["a", "b"]);
  });
});

describe("queue", () => {
  it("speaks calls in order after each one ends", () => {
    const { spoken, arbiter, finish } = setup("queue");
    arbiter.speak(call("a"));
    arbiter.speak(call("b"));
    expect(spoken).toEqual(["a"]);
    finish();
    expect(spoken).toEqual(["a", "b"]);
  });

  it("drops the oldest waiting call when more than three wait", () => {
    const { spoken, arbiter, events, finish } = setup("queue");
    ["a", "b", "c", "d", "e"].forEach((id) => arbiter.speak(call(id)));
    expect(events).toContain("dropped:b");
    finish();
    expect(spoken).toEqual(["a", "c"]);
  });

  it("drops a waiting call that is more than two seconds late", () => {
    const { spoken, arbiter, events, advance, finish } = setup("queue");
    arbiter.speak(call("a"));
    arbiter.speak(call("b", "normal", 0));
    advance(2500);
    finish();
    expect(events).toContain("late:b");
    expect(spoken).toEqual(["a"]);
  });

  it("goes on to the next call after an error", () => {
    const { spoken, arbiter, fail } = setup("queue");
    arbiter.speak(call("a"));
    arbiter.speak(call("b"));
    fail("synthesis-failed");
    expect(spoken).toEqual(["a", "b"]);
  });
});

describe("priority", () => {
  it("drops a lower priority call while one is speaking", () => {
    const { spoken, arbiter, events } = setup("priority");
    arbiter.speak(call("a", "normal"));
    arbiter.speak(call("b", "low"));
    expect(spoken).toEqual(["a"]);
    expect(events).toContain("dropped:b");
  });

  it("interrupts with an equal or higher priority call", () => {
    const { spoken, arbiter } = setup("priority");
    arbiter.speak(call("a", "normal"));
    arbiter.speak(call("b", "normal"));
    arbiter.speak(call("c", "high"));
    expect(spoken).toEqual(["a", "b", "c"]);
  });
});

describe("cancelAll", () => {
  it("stops the current call and drops the waiting ones", () => {
    const { spoken, arbiter, events, finish } = setup("queue");
    arbiter.speak(call("a"));
    arbiter.speak(call("b"));
    arbiter.cancelAll();
    finish();
    expect(spoken).toEqual(["a"]);
    expect(events).toContain("dropped:b");
    expect(arbiter.current()).toBeNull();
  });
});
