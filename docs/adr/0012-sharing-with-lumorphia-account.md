# ADR-0012: タイムラインの共有 (P2) を作るときは、ログインに Lumorphia アカウントを使う

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Proposed   |
| Date     | 2026-10-11 |
| Deciders | t1nyb0x    |

## Context

要件 9.2 (P2) はタイムラインの共有 (アップロード、公開範囲、URL、版の履歴) を挙げる。これを作るとサーバーと利用者の区別が要り、ADR-0002 (サーバーなし) の外に出る。

Lumorphia には、サービス共通のログイン (lumorphia/accounts、OIDC の発行元) があり、prismtone と scenote が使う。

## Decision

- MVP から P1 までは、ログインもサーバーも持たない。共有はファイル (エクスポートと読み込み) で行う
- 共有を作るときは、**ログインに Lumorphia アカウントを使う**。独自のアカウントは作らない
- サーバーの置き方 (Cloudflare Workers + D1 か、他のサービスと同じ VPS か)、公開範囲、保存するデータは、共有を作るときに別の ADR で決め、この ADR を Accepted にする

## Consequences

### 良い点

- 利用者は他の Lumorphia のサービスと同じアカウントで使える

### 悪い点・受け入れるリスク

- 共有を作るまでは、端末をまたいだ同期ができない

## Alternatives

- 最初から共有を作る: 要件 11 章の MVP の外。サーバーの運用が増える

## References

- 要件定義書 9.2
- lumorphia/accounts
- ADR-0002
