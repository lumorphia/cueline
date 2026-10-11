import { describe, expect, it } from "vitest";
import { createWakeLock } from "./wake-lock.ts";
import type { WakeLockStatus } from "./wake-lock.ts";

// 偽の navigator.wakeLock と document。release はテストが起こす (タブを切り替えたときにブラウザが外す)
function fakes(options: { supported?: boolean; deny?: boolean } = {}) {
  let visible = true;
  const listeners: (() => void)[] = [];
  const sentinels: { released: boolean; release: () => Promise<void>; fire: () => void }[] = [];
  const wakeLock = {
    async request() {
      if (options.deny) throw new Error("NotAllowedError");
      const handlers: (() => void)[] = [];
      const sentinel = {
        released: false,
        async release() {
          sentinel.released = true;
        },
        addEventListener: (_: string, fn: () => void) => void handlers.push(fn),
        fire() {
          sentinel.released = true;
          handlers.forEach((h) => h());
        },
      };
      sentinels.push(sentinel);
      return sentinel;
    },
  };
  const doc = {
    get visibilityState() {
      return visible ? "visible" : "hidden";
    },
    addEventListener: (_: string, fn: () => void) => void listeners.push(fn),
    removeEventListener: () => {},
  };
  const statuses: WakeLockStatus[] = [];
  const lock = createWakeLock({
    navigator: options.supported === false ? {} : { wakeLock },
    document: doc,
    onStatus: (s) => statuses.push(s),
  });
  const setVisible = async (v: boolean) => {
    visible = v;
    listeners.forEach((l) => l());
    await Promise.resolve();
    await Promise.resolve();
  };
  return { lock, sentinels, statuses, setVisible };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("createWakeLock", () => {
  it("asks for the lock when held", async () => {
    const { lock, sentinels, statuses } = fakes();
    lock.hold();
    await settle();
    expect(sentinels).toHaveLength(1);
    expect(statuses.at(-1)).toBe("held");
  });

  it("reports a browser without the wake lock", async () => {
    const { lock, statuses } = fakes({ supported: false });
    lock.hold();
    await settle();
    expect(statuses.at(-1)).toBe("unsupported");
  });

  it("reports a refused lock", async () => {
    const { lock, statuses } = fakes({ deny: true });
    lock.hold();
    await settle();
    expect(statuses.at(-1)).toBe("denied");
  });

  it("lets go of the lock when released", async () => {
    const { lock, sentinels, statuses } = fakes();
    lock.hold();
    await settle();
    lock.release();
    await settle();
    expect(sentinels[0]?.released).toBe(true);
    expect(statuses.at(-1)).toBe("off");
  });

  it("reports a lock the browser took away", async () => {
    const { lock, sentinels, statuses, setVisible } = fakes();
    lock.hold();
    await settle();
    await setVisible(false);
    sentinels[0]?.fire();
    expect(statuses.at(-1)).toBe("lost");
  });

  it("asks again when the page becomes visible while held", async () => {
    const { lock, sentinels, statuses, setVisible } = fakes();
    lock.hold();
    await settle();
    await setVisible(false);
    sentinels[0]?.fire();
    await setVisible(true);
    await settle();
    expect(sentinels).toHaveLength(2);
    expect(statuses.at(-1)).toBe("held");
  });

  it("does not ask again after being released", async () => {
    const { lock, sentinels, setVisible } = fakes();
    lock.hold();
    await settle();
    lock.release();
    await setVisible(false);
    await setVisible(true);
    await settle();
    expect(sentinels).toHaveLength(1);
  });

  it("asks only once when held twice", async () => {
    const { lock, sentinels } = fakes();
    lock.hold();
    lock.hold();
    await settle();
    expect(sentinels).toHaveLength(1);
  });
});
