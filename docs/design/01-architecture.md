# 01. 構成

## パッケージ

pnpm の monorepo (ADR-0004)。

```
packages/script   @timeline-call/script   スキーマ (zod)、YAML / JSON の読み書き、検証、展開、マイグレーション
packages/engine   @timeline-call/engine   論理時計、スケジューラ、再生の状態機械
packages/speech   @timeline-call/speech   SpeechProvider の境界と実装、コールの競合 (Call Arbiter)
apps/web          Vite + React。画面、保存、i18n、PWA、ブラウザのアダプター (時計、タイマー、Wake Lock)
spikes/           PoC のコード (08)。本体からは import しない
```

依存の向き (ESLint が強制する):

```
script   ->  zod、yaml
engine   ->  script
speech   ->  script (型だけ)
apps/web ->  script、engine、speech、react
```

要件 2.1 のコンポーネントとの対応:

| 要件のコンポーネント | 置き場所                                                   |
| -------------------- | ---------------------------------------------------------- |
| Script Parser        | `script` の `parseScript`                                  |
| Script Validator     | `script` の `validateScript`                               |
| Timeline Engine      | `engine`                                                   |
| Speech Manager       | `speech` の `SpeechManager` と `CallArbiter`               |
| Web Speech Provider  | `speech` の `WebSpeechProvider`                            |
| VOICEVOX Provider    | `speech` の `VoicevoxProvider` (P1)                        |
| Audio Manager        | `speech` の `PreparedAudioPlayer` (P1。Web Audio で鳴らす) |
| Timeline UI          | `apps/web`                                                 |
| Storage Manager      | `apps/web` の `storage/` (06)                              |

## データの流れ

```
ファイル / 貼り付け / サンプル
  │  (文字列)
  ▼
script.parseScript ── 上限の確認 → YAML/JSON の読み取り → version → zod → 意味の検証 → 最新版へ移行
  │  Result<Script, ScriptIssue[]>
  ▼
script.buildTimeline ── フェーズと通知を展開し、通知に ID と発火のフェーズ時刻を付ける
  │  Timeline
  ▼
engine.createEngine ── 論理時計、実行済みの集合、次のタイマー 1 本
  │  onFire(notification, dueAtMono)
  ▼
apps/web ──┬─ タグの絞り込み、有効/無効
           ├─ speech.SpeechManager.speak ── CallArbiter (中断 / 順番 / 優先度) ── Provider
           └─ 画面の表示 (display 通知、次のイベント、実行済み)
```

- engine はブラウザの API を知らない。`apps/web` が `clock` (`performance.now()`)、`timer` (Worker のタイマー、03)、イベントの受け手を渡す
- 描画は engine の `snapshot()` を `requestAnimationFrame` で読むだけ。描画が遅れても時刻はずれない
- タグの絞り込みは engine の外 (`apps/web`) で行う。絞り込みを変えても engine の状態はそのままで、鳴らすかどうかだけが変わる

## 配信と PWA

- ビルドした静的ファイルを Cloudflare Workers の静的アセットで配る (ADR-0002)。応答ヘッダーは 07
- Service Worker はアプリ本体 (HTML、JS、CSS、アイコン、サンプル) を版ごとに保存する。利用者のデータは Service Worker のキャッシュに入れない (06)
- 新しい版を見つけたら知らせるだけにし、利用者が「更新」を押したときに入れ替える。**再生中は入れ替えない** (コールが途中で止まるため)
- `manifest.webmanifest` でホーム画面に追加できるようにする (ADR-0009)

## デスクトップ版 (P2) への道

`apps/desktop` (Tauri) を足し、`apps/web` のビルドを WebView で開く。engine と script はそのまま使う。オーバーレイは ADR-0005 の外にあり、作る前に別に判断する。
