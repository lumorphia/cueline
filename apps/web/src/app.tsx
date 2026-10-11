// 画面の入口 (docs/design/05-ui.md)。ライブラリと再生を切り替える。設定は RM-25 で足す
import { buildTimeline, parseScript } from "@timeline-call/script";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "./i18n/context.tsx";
import { IssueList } from "./library/issue-list.tsx";
import { LibraryView } from "./library/library-view.tsx";
import type { ScriptRecord } from "./library/store.ts";
import { lastOpened, rememberLast, useScriptStore } from "./library/use-store.ts";
import { Player } from "./player/player.tsx";
import type { PlayerSettings } from "./player/use-player.ts";

const DEFAULT_COUNTDOWN_SECONDS = 15;

const SETTINGS: PlayerSettings = {
  conflict: "interrupt",
  rewindPolicy: "by-operation",
  voice: { voiceURI: null, rate: 1.2, volume: 1, pitch: 1 },
  chosenTags: null,
};

export function App() {
  const { t, language, setLanguage } = useI18n();
  const { store, memoryOnly } = useScriptStore();
  const [open, setOpen] = useState<ScriptRecord | null>(null);

  // 最後に開いたスクリプトから始める (戦闘の合間に開き直してすぐ使えるように)
  useEffect(() => {
    const key = lastOpened();
    if (store && key) void store.get(key).then((r) => r && setOpen(r));
  }, [store]);

  const openRecord = (record: ScriptRecord | null) => {
    rememberLast(record?.key ?? null);
    setOpen(record);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold">{t("app.title")}</h1>
        <div className="flex gap-2">
          {open && (
            <button
              type="button"
              className="rounded px-2 py-1 text-sm hover:bg-neutral-500/20"
              onClick={() => openRecord(null)}
            >
              {t("library.back")}
            </button>
          )}
          <button
            type="button"
            className="rounded px-2 py-1 text-sm opacity-70 hover:opacity-100"
            onClick={() => setLanguage(language === "ja" ? "en" : "ja")}
          >
            {t("app.language")}
          </button>
        </div>
      </div>
      {open ? (
        <OpenScript record={open} />
      ) : (
        store && <LibraryView store={store} memoryOnly={memoryOnly} onOpen={openRecord} />
      )}
    </main>
  );
}

function OpenScript({ record }: { record: ScriptRecord }) {
  // 開くたびに検証し直す (06)。アプリの版が上がって読めなくなったら、問題を出す
  const parsed = useMemo(() => parseScript(record.source, { format: record.format }), [record]);
  const timeline = useMemo(() => (parsed.ok ? buildTimeline(parsed.script) : null), [parsed]);
  if (!parsed.ok || !timeline) return <IssueList issues={parsed.ok ? [] : parsed.issues} />;
  const countdown = timeline.countdownMs ? timeline.countdownMs / 1000 : DEFAULT_COUNTDOWN_SECONDS;
  return (
    <>
      <p className="truncate text-sm opacity-70">{timeline.metadata.name}</p>
      <Player
        key={record.key}
        timeline={timeline}
        settings={SETTINGS}
        countdownSeconds={countdown}
      />
    </>
  );
}
