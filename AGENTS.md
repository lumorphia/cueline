# AGENTS.md

lumorphia/timeline-call: 利用者が書いたタイムライン (YAML / JSON) に沿って、決めた時刻に声と画面で知らせるブラウザのアプリ。サーバーを持たない。ゲームには一切触れない (ADR-0005)。名前は仮称。

今は設計の段階で、コードはまだ無い。

## 着手前に読むもの

| 目的             | 文書                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| 何を作るか       | [docs/timeline-call_要件定義書.md](docs/timeline-call_要件定義書.md) |
| 設計の索引       | [docs/SUMMARY.md](docs/SUMMARY.md)                                   |
| 次に何をやるか   | [docs/design/09-roadmap.md](docs/design/09-roadmap.md)               |
| なぜそう決めたか | [docs/adr/](docs/adr/README.md)                                      |

## 守ること

- **ゲームのプロセス・メモリ・通信・ログ・画面・入力に触れる機能を作らない** (ADR-0005、要件 10 章)。同期は利用者の操作だけで行う
- スクリプトは宣言的なデータ。コードや式を読まない。読み込みには上限を置く (ADR-0007)
- 利用者のデータは端末の外に送らない (ADR-0002)
- 同梱するサンプルは架空のボスで作る。実在のコンテンツ名・技名を使わない

## 依存の方向 (骨組みの段階で ESLint が強制する)

```
packages/script  ->  zod、yaml だけ。DOM も Node API も使わない
packages/engine  ->  script だけ。DOM を使わない (時計とタイマーは外から受け取る)
packages/speech  ->  script の型だけ。engine を import しない
apps/web         ->  上の全部と react
```

## 作業の流れ

1. `develop` から `feat/<topic>` (文書だけなら `docs/<topic>`) を切る。`develop` と `main` に直接コミットしない。`main` はリリース用で、`develop` からだけマージする
2. **TDD で進める**。実装より先に、失敗するテストを書く (red) → 通す最小の実装 (green) → 整える (refactor)。新しいテストは、実装前に一度落ちるのを確かめてから通す
3. `develop` 向けに PR を作る (`gh pr create --base develop`)。Issue は PR 本文とコミットメッセージに `Closes #N` を書いて閉じる
4. **`develop` へは「Rebase and merge」でマージする** (マージコミットを作らない。squash もしない)。`develop` → `main` だけはマージコミット

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
