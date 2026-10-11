# ADR-0003: リポジトリは public (AGPL-3.0) にする

| 項目     | 内容       |
| -------- | ---------- |
| Status   | Accepted   |
| Date     | 2026-10-11 |
| Deciders | t1nyb0x    |

## Context

org の GitHub Actions は Free プランで、private のリポジトリは合わせて月 2000 分まで (scenote ADR-0007)。Timeline Call には、知られると回避されるもの (モデレーションの判定など) が無い。サーバーも鍵も持たない (ADR-0002)。

## Decision

- **リポジトリは public、ライセンスは AGPL-3.0-only**。lumorphia/accounts、platform、editor、scenote と同じ線
- 弱点の修正は非公開で行う。Issue や公開の PR に書かず、非公開のセキュリティアドバイザリで直し、本番に入れてから公開する。手順は `SECURITY.md`
- リポジトリに入れてよいデータは scenote ADR-0006 の「public のリポジトリに入れてよいもの」に従う。同梱のサンプルは架空のボスで作る (要件 FR-007)

## Consequences

### 良い点

- CI の時間が org の上限を使わない。PR のたびに E2E まで回せる
- スクリプトの形式とエンジンを、利用者が読んで確かめられる。「ゲームに触れない」(ADR-0005) ことをコードで示せる

### 悪い点・受け入れるリスク

- うっかり入れたシークレットがそのまま公開される。骨組み (M1) で pre-commit と CI に gitleaks を入れる

### 追従して必要になること

- 外からの貢献を受け入れる前に CLA を用意する (受け入れないなら CONTRIBUTING に書く。scenote ADR-0006 と同じ)

## Alternatives

- private にする: CI の枠を食う。隠して守れるものが無い
- MIT などの緩いライセンス: 手を入れた版を閉じたサービスとして出されることを防げない。Lumorphia の他のリポジトリとも揃わない

## References

- lumorphia/scenote ADR-0006、ADR-0007
