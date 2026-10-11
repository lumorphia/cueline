// 画面の入口 (docs/design/05-ui.md)。今は同梱のサンプルを開く。ライブラリと設定は RM-24 / 25 で足す
import { buildTimeline, parseScript } from "@timeline-call/script";
import { useMemo } from "react";
import { useI18n } from "./i18n/context.tsx";
import { Player } from "./player/player.tsx";
import type { PlayerSettings } from "./player/use-player.ts";
import sample from "./samples/crystal-golem.yaml?raw";

const DEFAULT_COUNTDOWN_SECONDS = 15;

const SETTINGS: PlayerSettings = {
  conflict: "interrupt",
  rewindPolicy: "by-operation",
  voice: { voiceURI: null, rate: 1.2, volume: 1, pitch: 1 },
  chosenTags: null,
};

export function App() {
  const { t, language, setLanguage } = useI18n();
  const timeline = useMemo(() => {
    const result = parseScript(sample);
    if (!result.ok) throw new Error("同梱のサンプルが読めない");
    return buildTimeline(result.script);
  }, []);
  const countdown = timeline.countdownMs ? timeline.countdownMs / 1000 : DEFAULT_COUNTDOWN_SECONDS;

  return (
    <main className="mx-auto flex h-dvh max-w-3xl flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold">{t("app.title")}</h1>
        <button
          type="button"
          className="rounded px-2 py-1 text-sm opacity-70 hover:opacity-100"
          onClick={() => setLanguage(language === "ja" ? "en" : "ja")}
        >
          {t("app.language")}
        </button>
      </div>
      <p className="truncate text-sm opacity-70">{timeline.metadata.name}</p>
      <Player timeline={timeline} settings={SETTINGS} countdownSeconds={countdown} />
    </main>
  );
}
