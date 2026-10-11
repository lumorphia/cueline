# ADR-0004: pnpm の monorepo にし、パッケージの依存の向きを ESLint で縛る

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-11 |
| Deciders | t1nyb0x    |

## Context

要件 1.3 は基盤を特定のゲームに依存させないとし、1.2 と 9.1 は将来のデスクトップ版 (Tauri) を見込む。タイムラインの時計とスケジューラは、画面 (React) からもブラウザの API からも切り離せるはずで、切り離しておけば偽の時計でテストでき、デスクトップ版でもそのまま使える。

lumorphia/editor は pnpm の monorepo で、パッケージ間の依存を ESLint で縛り、そのルールが効いていることをテストで確かめている。

## Decision

pnpm の monorepo にし、次の 3 つのパッケージと 1 つのアプリに分ける。

```
packages/script   @timeline-call/script   スキーマ (zod)、YAML / JSON の読み書き、検証、展開、マイグレーション
packages/engine   @timeline-call/engine   論理時計、スケジューラ、再生の状態機械
packages/speech   @timeline-call/speech   読み上げのプロバイダ、競合の制御
apps/web          Vite + React の画面。上の全部をつなぐ。保存、i18n、PWA
```

依存の向き:

```
script  ->  zod、yaml だけ。DOM も Node API も使わない
engine  ->  script だけ。DOM を使わない (時計とタイマーは外から受け取る)
speech  ->  script の型だけ。engine を import しない。ブラウザの API はアダプターの中だけ
apps/web -> 上の全部と react
```

- どのパッケージもゲーム (FF14) の言葉を持たない。ロールなどはスクリプトの `tags` で表す (要件 FR-006)
- パッケージは公開しない (`private: true`)。スコープ `@timeline-call/*` は仮称で、正式名が決まったら置き換える
- 開発の道具 (ESLint の boundaries、vitest のソース読み、Playwright、husky + gitleaks、release-please、Renovate) は lumorphia/editor の形を持ってくる。lumorphia/platform に共通の道具ができていれば、そちらを使う

## Consequences

### 良い点

- engine を DOM なしでテストできる。30 分の再生 (要件 11.3-5) も偽の時計で一瞬で確かめられる
- デスクトップ版は apps を足すだけで、engine と script はそのまま使える

### 悪い点・受け入れるリスク

- 小さなアプリにしては設定ファイルが多い。editor から写すので、作る手間は小さい

### 追従して必要になること

- 骨組み (M1) で `tooling/eslint-boundaries.test.ts` 相当のテストを置く

## Alternatives

- Vite の単一アプリで、`src/` のディレクトリで分ける: 最初は軽いが、依存の向きを強制しにくく、デスクトップ版で切り出しが要る

## References

- 要件定義書 1.2、1.3、9.1
- lumorphia/editor `AGENTS.md` (依存の方向)
