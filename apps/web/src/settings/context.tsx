// 設定を配り、変えたらすぐ保存する
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadSettings, saveSettings } from "./settings.ts";
import type { Settings } from "./settings.ts";

type SettingsState = { settings: Settings; update: (change: (s: Settings) => Settings) => void };

const SettingsContext = createContext<SettingsState | null>(null);

const storage = (): Pick<Storage, "getItem" | "setItem"> => {
  try {
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => loadSettings(storage()));
  const value = useMemo<SettingsState>(
    () => ({
      settings,
      update(change) {
        setSettings((current) => {
          const next = change(current);
          saveSettings(storage(), next);
          return next;
        });
      },
    }),
    [settings],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("SettingsProvider の外で useSettings を使った");
  return value;
}
