# ADR の一覧

| 番号                                            | 決めたこと                                                      | Status               |
| ----------------------------------------------- | --------------------------------------------------------------- | -------------------- |
| [0001](0001-record-architecture-decisions.md)   | ADR を使う                                                      | Accepted             |
| [0002](0002-client-only-static-app.md)          | クライアントだけで動く静的 Web アプリにし、Cloudflare で配る    | Accepted             |
| [0003](0003-public-repository-agpl.md)          | リポジトリは public (AGPL-3.0) にする                           | Accepted             |
| [0004](0004-pnpm-monorepo-and-boundaries.md)    | pnpm の monorepo にし、依存の向きを ESLint で縛る               | Accepted             |
| [0005](0005-never-touch-the-game.md)            | ゲームには一切触れない                                          | Accepted             |
| [0006](0006-logical-clock-and-fired-set.md)     | 論理時刻は単調時計から計算し、通知は実行済みの集合で管理する    | Accepted             |
| [0007](0007-declarative-script.md)              | スクリプトは宣言的な YAML / JSON、zod で検証、読み込みに上限    | Accepted             |
| [0008](0008-pull-countdown-and-event-sync.md)   | 開始はプルカウント同期、途中はイベント同期と手動の補正          | Accepted             |
| [0009](0009-mobile-standalone.md)               | スマホ・タブレット単体で動かし、その端末から鳴らす              | Accepted             |
| [0010](0010-speech-providers-and-audio-pack.md) | 読み上げはプロバイダで抽象化し、VOICEVOX の声は音声パックで渡す | Accepted (実装は P1) |
| [0011](0011-ui-language-ja-en.md)               | 画面は日本語と英語、文言は辞書で持つ                            | Accepted             |
| [0012](0012-sharing-with-lumorphia-account.md)  | 共有 (P2) のログインは Lumorphia アカウント                     | Proposed             |

本文中の「scenote ADR-NNNN」などは、lumorphia の他のリポジトリの ADR を指す。
