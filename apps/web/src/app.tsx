// 画面の入口 (docs/design/05-ui.md)。ライブラリ、再生、設定を切り替える
import { buildTimeline, parseScript } from "@timeline-call/script";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "./i18n/context.tsx";
import { IssueList } from "./library/issue-list.tsx";
import { LibraryView } from "./library/library-view.tsx";
import type { ScriptRecord } from "./library/store.ts";
import { lastOpened, rememberLast, useScriptStore } from "./library/use-store.ts";
import { Player } from "./player/player.tsx";
import { useSettings } from "./settings/context.tsx";
import { SettingsView } from "./settings/settings-view.tsx";
import { lookaheadFor, tagsFor, withTags } from "./settings/settings.ts";

export function App() {
  const { t, language, setLanguage } = useI18n();
  const { store, memoryOnly } = useScriptStore();
  const [open, setOpen] = useState<ScriptRecord | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 最後に開いたスクリプトから始める (戦闘の合間に開き直してすぐ使えるように)
  useEffect(() => {
    const key = lastOpened();
    if (store && key) void store.get(key).then((r) => r && setOpen(r));
  }, [store]);

  const openRecord = (record: ScriptRecord | null) => {
    rememberLast(record?.key ?? null);
    setOpen(record);
    setShowSettings(false);
  };

  let body: ReactNode = null;
  if (showSettings) body = <SettingsView />;
  else if (open) body = <OpenScript record={open} />;
  else if (store) body = <LibraryView store={store} memoryOnly={memoryOnly} onOpen={openRecord} />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold">{t("app.title")}</h1>
        <div className="flex gap-1">
          {(open || showSettings) && (
            <HeaderButton
              onClick={() => (showSettings ? setShowSettings(false) : openRecord(null))}
            >
              {showSettings ? t("app.back") : t("library.back")}
            </HeaderButton>
          )}
          {!showSettings && (
            <HeaderButton onClick={() => setShowSettings(true)}>{t("app.settings")}</HeaderButton>
          )}
          <HeaderButton onClick={() => setLanguage(language === "ja" ? "en" : "ja")}>
            {t("app.language")}
          </HeaderButton>
        </div>
      </div>
      {body}
    </main>
  );
}

function HeaderButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className="min-h-10 rounded px-2 text-sm hover:bg-neutral-500/20"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function OpenScript({ record }: { record: ScriptRecord }) {
  const { settings, update } = useSettings();
  // 開くたびに検証し直す (06)。アプリの版が上がって読めなくなったら、問題を出す
  const parsed = useMemo(() => parseScript(record.source, { format: record.format }), [record]);
  const timeline = useMemo(() => (parsed.ok ? buildTimeline(parsed.script) : null), [parsed]);
  const scriptId = timeline?.metadata.id ?? "";
  const chosenTags = useMemo(() => tagsFor(settings, scriptId), [settings, scriptId]);
  const playerSettings = useMemo(
    () => ({
      conflict: settings.conflict,
      rewindPolicy: settings.rewindPolicy,
      voice: settings.voice,
      chosenTags,
      lookaheadMs: lookaheadFor(settings),
      upcomingCount: settings.upcomingCount,
    }),
    [settings, chosenTags],
  );
  if (!parsed.ok || !timeline) return <IssueList issues={parsed.ok ? [] : parsed.issues} />;
  const countdown = timeline.countdownMs ? timeline.countdownMs / 1000 : settings.countdownSeconds;
  return (
    <>
      <p className="truncate text-sm opacity-70">{timeline.metadata.name}</p>
      <Player
        key={record.key}
        timeline={timeline}
        settings={playerSettings}
        countdownSeconds={countdown}
        nudgeMs={Math.round(settings.nudgeSeconds * 1000)}
        onTagsChange={(tags) => update((s) => withTags(s, scriptId, tags))}
      />
    </>
  );
}
