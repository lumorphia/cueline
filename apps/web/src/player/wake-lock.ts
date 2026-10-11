// 再生中に画面の自動ロックを止める (要件 FR-208、ADR-0009)。タブを切り替えるとブラウザが外すので、
// 見えるようになったら取り直す。取れない端末 (unsupported / denied) は画面で知らせる
export type WakeLockStatus = "off" | "held" | "lost" | "unsupported" | "denied";

type Sentinel = {
  release(): Promise<void>;
  addEventListener(type: "release", fn: () => void): void;
};

type Options = {
  navigator: { wakeLock?: { request(type: "screen"): Promise<Sentinel> } };
  document: {
    readonly visibilityState: string;
    addEventListener(type: "visibilitychange", fn: () => void): void;
    removeEventListener(type: "visibilitychange", fn: () => void): void;
  };
  onStatus: (status: WakeLockStatus) => void;
};

export function createWakeLock({ navigator, document, onStatus }: Options) {
  let wanted = false;
  let sentinel: Sentinel | null = null;
  let asking = false;

  async function acquire() {
    if (!wanted || sentinel || asking || document.visibilityState !== "visible") return;
    const api = navigator.wakeLock;
    if (!api) return onStatus("unsupported");
    asking = true;
    try {
      const got = await api.request("screen");
      asking = false;
      // 待っている間に release されていたら、すぐ返す
      if (!wanted) return void got.release();
      sentinel = got;
      got.addEventListener("release", () => {
        if (sentinel !== got) return;
        sentinel = null;
        if (wanted) onStatus("lost");
      });
      onStatus("held");
    } catch {
      asking = false;
      onStatus("denied");
    }
  }

  const onVisibility = () => void acquire();
  document.addEventListener("visibilitychange", onVisibility);

  return {
    hold() {
      wanted = true;
      void acquire();
    },
    release() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      void s?.release();
      onStatus("off");
    },
    dispose() {
      document.removeEventListener("visibilitychange", onVisibility);
      this.release();
    },
  };
}
