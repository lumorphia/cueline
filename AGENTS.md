# AGENTS.md

lumorphia/timeline-call: 利用者が書いたタイムライン (YAML / JSON) に沿って、決めた時刻に声と画面で知らせるブラウザのアプリ。サーバーを持たない。ゲームには一切触れない (ADR-0005)。名前は仮称。

今は M1 (骨組みと PoC)。パッケージの中身は M2 で作る。

## 構成

```
packages/script   @timeline-call/script   スキーマ (zod)、YAML / JSON の読み書き、検証、展開 (docs/design/02)
packages/engine   @timeline-call/engine   論理時計、スケジューラ、再生の状態機械 (docs/design/03)
packages/speech   @timeline-call/speech   読み上げのプロバイダ、コールの競合 (docs/design/04)
apps/web          @timeline-call/web      Vite + React の画面
e2e/              Playwright の E2E (apps/web のビルドに対して回す)
tooling/          リポジトリ全体の決まりのテスト (ESLint の依存の向き)
spikes/           PoC の計測ページ (本体から import しない。ESLint も見ない。docs/design/08-poc.md)
```

パッケージは公開しない (`private: true`)。exports は `./src/index.ts` を直接指し、ビルドしない (Vite とテストがソースを読む)。

## 着手前に読むもの

| 目的             | 文書                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| 何を作るか       | [docs/timeline-call_要件定義書.md](docs/timeline-call_要件定義書.md) |
| 設計の索引       | [docs/SUMMARY.md](docs/SUMMARY.md)                                   |
| 次に何をやるか   | [docs/design/09-roadmap.md](docs/design/09-roadmap.md)               |
| なぜそう決めたか | [docs/adr/](docs/adr/README.md)                                      |
| 配信             | [docs/runbook/deploy.md](docs/runbook/deploy.md)                     |

## 守ること

- **ゲームのプロセス・メモリ・通信・ログ・画面・入力に触れる機能を作らない** (ADR-0005、要件 10 章)。同期は利用者の操作だけで行う
- スクリプトは宣言的なデータ。コードや式を読まない。読み込みには上限を置く (ADR-0007)
- 利用者のデータは端末の外に送らない (ADR-0002)
- 同梱するサンプルは架空のボスで作る。実在のコンテンツ名・技名を使わない

## 依存の方向 (ESLint が強制する。tooling/eslint-boundaries.test.ts が確かめる)

```
packages/script  ->  zod、yaml だけ。DOM も Node API も使わない
packages/engine  ->  script だけ。DOM を使わない (時計とタイマーは外から受け取る)
packages/speech  ->  script の型だけ。engine を import しない
apps/web         ->  上の全部と react。Node API を使わない。dangerouslySetInnerHTML を使わない
```

ほかのパッケージは exports から使う (`@timeline-call/*/src/...` を直接指さない)。

## 作業の流れ

1. `develop` から `feat/<topic>` (文書だけなら `docs/<topic>`) を切る。`develop` と `main` に直接コミットしない。`main` はリリース用で、`develop` からだけマージする
2. **TDD で進める**。実装より先に、失敗するテストを書く (red) → 通す最小の実装 (green) → 整える (refactor)。新しいテストは、実装前に一度落ちるのを確かめてから通す
3. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` を通す。husky が pre-commit で変更ファイルの ESLint / Prettier と gitleaks、pre-push で typecheck と test を回す (`pnpm install` で有効になる)。画面を触ったら `pnpm e2e` も
4. `develop` 向けに PR を作る (`gh pr create --base develop`)。Issue は PR 本文とコミットメッセージに `Closes #N` を書いて閉じる
5. **`develop` へは「Rebase and merge」でマージする** (マージコミットを作らない。squash もしない)。`develop` → `main` だけはマージコミット

コミットは `feat:` `fix:` `docs:` `test:` `refactor:` `build:` `ci:` の Conventional Commits、本文は日本語。

## テストの書き方

- **1 つの `it` に 1 つの振る舞い**。名前は「何をすると何になる」を言い切る
- **カバレッジは手がかりで、目標ではない**。閾値 80% は下限
- engine は偽の時計と偽のタイマーで回す。実時間を待つテストを書かない
- ブラウザでしか確かめられないもの (Web Speech の呼び出し、Wake Lock、Service Worker、CSP) は Playwright の E2E で見る。Web Speech は偽物に差し替える

## コードの約束

- TypeScript strict、`import type` を使う、`.ts` 拡張子付きで import する
- コメント・ドキュメント・コミットは日本語。絵文字は使わない
- 配列やオブジェクトは変更せず新しく作る
- 設計上の判断を変えるときは ADR を追加する (`docs/adr/`)

## よく使うコマンド

```sh
pnpm install
pnpm dev                 # http://localhost:4310 (apps/web)
pnpm test                # vitest (packages、apps、tooling)
pnpm test:coverage       # 閾値 80%
pnpm e2e                 # build してから Playwright (初回は pnpm exec playwright install chromium)
npx wrangler deploy                            # 本体を載せる (pnpm build の後。docs/runbook/deploy.md)
npx wrangler deploy -c spikes/wrangler.jsonc   # PoC の計測ページを載せ直す
```
