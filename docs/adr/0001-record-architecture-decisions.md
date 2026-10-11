# ADR-0001: ADR を用いて設計判断を記録する

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-11 |
| Deciders | t1nyb0x    |

## Context

Timeline Call は Lumorphia の他のサービス (prismtone、scenote) と違い、サーバーを持たないブラウザのアプリになる。他のサービスの判断のうち、どれを引き継ぎ、どこを変えたかを後から追えるようにしたい。

## Decision

設計上の重要な判断は ADR として `docs/adr/` に記録する。prismtone、editor、scenote と同じ運用にする。

- 形式は `0000-template.md` に従う
- ファイル名は `NNNN-kebab-case-title.md`、番号は通し番号で欠番を作らない
- 一度 Accepted にした ADR は書き換えず、覆す場合は新しい ADR を作り、旧 ADR の Status を `Superseded by ADR-NNNN` にする
- 「重要な判断」の目安: 変更に 1 日以上かかる、利用者のデータの扱いが変わる、外部サービスへの依存が増減する、スクリプトの形式が変わる、他の Lumorphia のサービスと違う判断をする、のいずれか
- 他のリポジトリの判断をそのまま引き継ぐものはコピーせず、そのリポジトリの ADR 番号を参照する

## Consequences

### 良い点

- 要件定義書の「未決」が、どの ADR で決まったか追える

### 悪い点・受け入れるリスク

- 記録の手間が増える。上記の目安で線を引く

## Alternatives

- 設計書の中に判断を書くだけにする: 設計書は書き換わるので、いつ・なぜ変えたかが残らない

## References

- lumorphia/scenote `docs/adr/0001-record-architecture-decisions.md`
