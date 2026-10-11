# ADR-0002: クライアントだけで動く静的 Web アプリにし、Cloudflare で配る

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-11 |
| Deciders | t1nyb0x    |

## Context

要件定義書 1.4 と NFR-003 は、初期リリースでサーバー処理を必須にしないとしている。タイムラインの実行、読み上げ、保存はすべてブラウザでできる。一方で、ほかの Lumorphia のサービス (prismtone、scenote) は VPS + Docker Compose で動いており、同じ構成にするとサーバーの運用が増える。

lumorphia/website は Cloudflare に wrangler で載っており、静的な配信の運用はすでにある。

## Decision

- **ビルドした静的ファイルだけを配る**。API、DB、ジョブを持たない
- 配信は **Cloudflare Workers の静的アセット** (website と同じ wrangler の運用)。応答ヘッダー (CSP など、ADR-0007 と `docs/design/07-security.md`) を付ける
- **PWA にする**。Service Worker でアプリ本体を保存し、初回読み込み後はオフラインで使える (NFR-201)
- URL は正式名が決まってから `<正式名>.lumorphia.com` にする。それまでは workers.dev のプレビューだけ
- 利用者のデータ (スクリプト、設定、音声) は端末の中にだけ置く (NFR-103、`docs/design/06-storage.md`)

## Consequences

### 良い点

- サーバーの運用、障害対応、バックアップが要らない。費用はほぼ 0
- 利用者のデータを預からないので、プライバシーポリシーと漏えいの心配が小さい
- 将来のデスクトップ版 (Tauri) は、同じビルドを WebView で開くだけで始められる

### 悪い点・受け入れるリスク

- 端末をまたいだ同期・共有ができない。共有 (要件 9.2、P2) を作るときは、サーバーを足す判断を別の ADR でする (ADR-0012)
- ブラウザのデータが消されると、スクリプトも消える。エクスポート (FR-005) を目立つ場所に置き、利用者に控えを持ってもらう

### 追従して必要になること

- 骨組み (ロードマップ M1) で wrangler の設定と、PR ごとのプレビューを用意する
- Service Worker の更新の出し方 (新しい版があることを知らせ、再生中は入れ替えない) を決める (`docs/design/01-architecture.md`)

## Alternatives

- prismtone と同じ VPS に載せる: 静的ファイルのためにサーバーの運用を増やす理由が無い
- GitHub Pages: 応答ヘッダーを付けられず、CSP を `<meta>` でしか書けない。`frame-ancestors` などが効かない
- 最初からサーバーを持ち、スクリプトをクラウドに保存する: 要件 10 章の対象外

## References

- 要件定義書 1.4、7.1 NFR-003、7.4 NFR-201、9.2、10 章
- lumorphia/website `wrangler.jsonc`
