// 画面の入口 (docs/design/05-ui.md)。ライブラリ、再生、設定を切り替える
import { buildTimeline, hasComments, parseScript, serializeScript } from "@timeline-call/script";
import type { Script } from "@timeline-call/script";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { newScript } from "./editor/draft.ts";
import { EditorView } from "./editor/editor-view.tsx";
import { useI18n } from "./i18n/context.tsx";
import { IssueList } from "./library/issue-list.tsx";
import { LibraryView } from "./library/library-view.tsx";
import type { ScriptRecord, ScriptStore } from "./library/store.ts";
import { lastOpened, rememberLast, useScriptStore } from "./library/use-store.ts";
import { AboutView } from "./about/about-view.tsx";
import { Player } from "./player/player.tsx";
import { useServiceWorker } from "./pwa/use-service-worker.ts";
import { useSettings } from "./settings/context.tsx";
import { SettingsView } from "./settings/settings-view.tsx";
import { lookaheadFor, tagsFor, withTags } from "./settings/settings.ts";

export function App() {
  const { t, language, setLanguage } = useI18n();
  const { store, memoryOnly } = useScriptStore();
  const [open, setOpen] = useState<ScriptRecord | null>(null);
  const [panel, setPanel] = useState<"settings" | "about" | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [playing, setPlaying] = useState(false);
  const { updateReady, apply } = useServiceWorker();

  // 最後に開いたスクリプトから始める (戦闘の合間に開き直してすぐ使えるように)
  useEffect(() => {
    const key = lastOpened();
    if (store && key) void store.get(key).then((r) => r && setOpen(r));
  }, [store]);

  const openRecord = (record: ScriptRecord | null) => {
    rememberLast(record?.key ?? null);
    setOpen(record);
    setPanel(null);
  };

  let body: ReactNode = null;
  const edit = (record: ScriptRecord) => {
    const parsed = parseScript(record.source, { format: record.format });
    if (!parsed.ok) return;
    setEditing({
      session: crypto.randomUUID(),
      script: parsed.script,
      record,
      hadComments: hasComments(record.source, record.format),
    });
  };
  const create = () =>
    setEditing({
      session: crypto.randomUUID(),
      script: newScript({
        name: t("library.newName"),
        randomId: () => crypto.randomUUID().slice(0, 8),
      }),
      record: null,
      hadComments: false,
    });

  if (panel === "settings") body = <SettingsView />;
  else if (panel === "about") body = <AboutView />;
  else if (editing && store)
    body = (
      <EditorView
        // 保存で record が決まっても作り直さない (作り直すと打った内容が初めの下書きに戻る)
        key={editing.session}
        initial={editing.script}
        hadComments={editing.hadComments}
        onSave={async (script) => {
          const record = await saveDraft(store, script, editing.record);
          setEditing((e) => (e ? { ...e, script, record } : e));
        }}
        onClose={() => setEditing(null)}
      />
    );
  else if (open) body = <OpenScript record={open} onPlayingChange={setPlaying} />;
  else if (store)
    body = (
      <LibraryView
        store={store}
        memoryOnly={memoryOnly}
        onOpen={openRecord}
        onEdit={edit}
        onCreate={create}
        onAbout={() => setPanel("about")}
      />
    );

  return (
    <main className="mx-auto flex h-dvh max-w-3xl flex-col gap-3 px-4 pt-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-base font-bold sm:text-lg">{t("app.title")}</h1>
        <div className="flex shrink-0 gap-1">
          {(open || panel) && !editing && (
            <HeaderButton onClick={() => (panel ? setPanel(null) : openRecord(null))}>
              {panel ? t("app.back") : t("library.back")}
            </HeaderButton>
          )}
          {!panel && (
            <HeaderButton onClick={() => setPanel("settings")}>{t("app.settings")}</HeaderButton>
          )}
          <HeaderButton onClick={() => setLanguage(language === "ja" ? "en" : "ja")}>
            {t("app.language")}
          </HeaderButton>
        </div>
      </div>
      {updateReady && (
        <div
          className="flex flex-wrap items-center gap-2 rounded bg-sky-500/15 px-3 py-2 text-sm"
          role="status"
        >
          <span className="mr-auto">
            {t(playing ? "app.updateWhilePlaying" : "app.updateReady")}
          </span>
          <button
            type="button"
            disabled={playing}
            onClick={apply}
            className="min-h-10 rounded bg-sky-600 px-3 text-white disabled:opacity-40"
          >
            {t("app.update")}
          </button>
        </div>
      )}
      {/* 再生は画面の高さに収め、余りを次の通知の一覧に回す。ライブラリと設定は縦にスクロールする */}
      <div
        className={`flex min-h-0 flex-1 flex-col ${open && !panel && !editing ? "" : "overflow-y-auto pb-4"}`}
      >
        {body}
      </div>
    </main>
  );
}

type Editing = {
  /** エディタを開くたびに決める。EditorView の key に使う */
  session: string;
  script: Script;
  record: ScriptRecord | null;
  hadComments: boolean;
};

/** エディタの下書きを保存する。直したものは元の形式 (YAML / JSON) で書き直し、新しいものは YAML で置く */
async function saveDraft(
  store: ScriptStore,
  script: Script,
  record: ScriptRecord | null,
): Promise<ScriptRecord> {
  const format = record?.format ?? "yaml";
  const saved: ScriptRecord = {
    key: record?.key ?? crypto.randomUUID(),
    metadataId: script.metadata.id,
    name: script.metadata.name,
    format,
    source: serializeScript(script, format),
    updatedAt: Date.now(),
  };
  await store.put(saved);
  return saved;
}

function HeaderButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className="min-h-10 rounded px-2 text-sm whitespace-nowrap hover:bg-neutral-500/20"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function OpenScript({
  record,
  onPlayingChange,
}: {
  record: ScriptRecord;
  onPlayingChange: (playing: boolean) => void;
}) {
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
        onPlayingChange={onPlayingChange}
      />
    </>
  );
}
