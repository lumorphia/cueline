// node --test spikes/poc-002-speech/ で回す。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createArbiter } from "./arbiter.js";

// 偽のプロバイダ。speak したものを覚え、終わらせる・失敗させるのはテストが行う。
function fakeProvider() {
  const spoken = [];
  let cancels = 0;
  let current = null;
  return {
    spoken,
    get cancels() {
      return cancels;
    },
    speak(call, cbs) {
      spoken.push(call.id);
      current = { call, cbs };
      cbs.onStart();
    },
    cancel() {
      cancels += 1;
      const c = current;
      current = null;
      c?.cbs.onError("interrupted");
    },
    finish() {
      const c = current;
      current = null;
      c?.cbs.onEnd();
    },
  };
}

function setup(mode, opts = {}) {
  const provider = fakeProvider();
  let t = 0;
  const events = [];
  const arbiter = createArbiter({
    mode,
    provider,
    now: () => t,
    defer: (fn) => fn(),
    onEvent: (e) => events.push(`${e.type}:${e.call.id}`),
    ...opts,
  });
  return { provider, arbiter, events, advance: (ms) => (t += ms) };
}

const call = (id, priority = "normal", dueAt = 0) => ({ id, text: id, priority, dueAt });

test("interrupt cancels the current call and speaks the new one", () => {
  const { provider, arbiter, events } = setup("interrupt");
  arbiter.speak(call("a"));
  arbiter.speak(call("b"));
  assert.deepEqual(provider.spoken, ["a", "b"]);
  assert.ok(events.includes("interrupted:a"));
});

test("queue speaks calls in order after each one ends", () => {
  const { provider, arbiter } = setup("queue");
  arbiter.speak(call("a"));
  arbiter.speak(call("b"));
  assert.deepEqual(provider.spoken, ["a"]);
  provider.finish();
  assert.deepEqual(provider.spoken, ["a", "b"]);
});

test("queue drops the oldest waiting call when more than three wait", () => {
  const { provider, arbiter, events } = setup("queue");
  ["a", "b", "c", "d", "e"].forEach((id) => arbiter.speak(call(id)));
  assert.ok(events.includes("dropped:b"));
  provider.finish();
  assert.deepEqual(provider.spoken, ["a", "c"]);
});

test("queue drops a waiting call that is more than two seconds late", () => {
  const { provider, arbiter, events, advance } = setup("queue");
  arbiter.speak(call("a"));
  arbiter.speak(call("b", "normal", 0));
  advance(2500);
  provider.finish();
  assert.ok(events.includes("late:b"));
  assert.deepEqual(provider.spoken, ["a"]);
});

test("priority drops a lower priority call while one is speaking", () => {
  const { provider, arbiter, events } = setup("priority");
  arbiter.speak(call("a", "normal"));
  arbiter.speak(call("b", "low"));
  assert.deepEqual(provider.spoken, ["a"]);
  assert.ok(events.includes("dropped:b"));
});

test("priority interrupts with an equal or higher priority call", () => {
  const { provider, arbiter } = setup("priority");
  arbiter.speak(call("a", "normal"));
  arbiter.speak(call("b", "high"));
  assert.deepEqual(provider.spoken, ["a", "b"]);
});

test("callbacks from an interrupted call do not end the new call", () => {
  const { provider, arbiter, events } = setup("interrupt");
  arbiter.speak(call("a"));
  arbiter.speak(call("b"));
  assert.ok(!events.includes("end:b"));
  assert.equal(arbiter.current()?.id, "b");
});
