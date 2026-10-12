# ADR-0014: 正式名を CueLine にする

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-12 |
| Deciders | t1nyb0x    |

## Context

要件定義書 v0.3 まではサービス名が未定で、仮称 Timeline Call (リポジトリ `lumorphia/timeline-call`、パッケージのスコープ `@timeline-call/*`) で進めていた (ADR-0004)。公開ゲート (09 の RM-31) は、公開の前に正式名を決めて置き換えることを求める。

## Decision

- **正式名は CueLine** (cue: 合図 + line: 時間軸)。画面・manifest・文書の名前はこれにする。小文字の識別子は `cueline`
- リポジトリは `lumorphia/cueline`、パッケージのスコープは `@cueline/*`、Worker は `cueline` と `cueline-spikes`、公開の URL は `cueline.lumorphia.com`
- 端末に置くものの名前 (IndexedDB の `cueline`、localStorage の `cueline:` で始まるキー、Service Worker の cache の `cueline-`、Trusted Types のポリシー `cueline`) も揃える。URL が変わると保存場所 (オリジン) も別になり、どのみち引き継げないので、合わせて変える
- 決めた ADR (0001〜0013) と PoC の記録は書き換えない。当時の名前のまま残す

## Consequences

### 良い点

- 名前から「合図を時間軸に並べる」ことが伝わる。Lumorphia の他のサービス (Prismtone、Scenote) と同じく、2 つの語を組み合わせた名前になる

### 悪い点・受け入れるリスク

- 仮の URL (`timeline-call.dev-t1nyb0x.workers.dev`) で保存したスクリプトと設定は、新しい URL には移らない。使っていたのは運営者だけなので、書き出して読み込み直す
- 同じ名前の製品が他にあるかは、公開の前に確かめる (商標)

### 追従して必要になること

- GitHub のリポジトリの名前を変える (古い URL は GitHub が転送する)
- 古い Worker (`timeline-call`、`timeline-call-spikes`) を消す
- `cueline.lumorphia.com` を当て、lumorphia/website に載せる

## Alternatives

- 仮称のまま公開する: 公開ゲートで決めると約束している
- 端末に置くものの名前は仮称のまま残す: 移せないのは同じで、名前がずれて紛らわしいだけ

## References

- ADR-0004、要件定義書 14 章 1、09-roadmap の公開ゲート
