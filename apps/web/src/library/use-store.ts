// 保存の置き場を用意する。IndexedDB が使えなければ記憶の中に置き、利用者に知らせる (06 の「失敗に強くする」)
import { useEffect, useState } from "react";
import { createIndexedDbStore, createMemoryStore } from "./store.ts";
import type { ScriptStore } from "./store.ts";

export function useScriptStore(): { store: ScriptStore | null; memoryOnly: boolean } {
  const [state, setState] = useState<{ store: ScriptStore | null; memoryOnly: boolean }>({
    store: null,
    memoryOnly: false,
  });
  useEffect(() => {
    let alive = true;
    // 消されにくくしてもらう。断られても動く
    void navigator.storage?.persist?.().catch(() => false);
    createIndexedDbStore()
      .then((store) => alive && setState({ store, memoryOnly: false }))
      .catch(() => alive && setState({ store: createMemoryStore(), memoryOnly: true }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

const LAST_KEY = "cueline:last";

export const rememberLast = (key: string | null) => {
  try {
    if (key === null) localStorage.removeItem(LAST_KEY);
    else localStorage.setItem(LAST_KEY, key);
  } catch {
    // 覚えられなくても開ける
  }
};

export const lastOpened = (): string | null => {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
};
