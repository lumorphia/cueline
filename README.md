# lumorphia/timeline-call

Timeline Call (仮称): あらかじめ書いたタイムラインに沿って、決めた時刻に声と画面で知らせる (コールする) ブラウザのアプリ。FINAL FANTASY XIV の高難易度コンテンツでの利用を想定するが、ゲームには一切触れない。PC の別モニタでも、スマホ単体でも使える。Lumorphia のサービスのひとつ。

要件は [docs/timeline-call_要件定義書.md](docs/timeline-call_要件定義書.md)、設計は [docs/SUMMARY.md](docs/SUMMARY.md)、判断は [docs/adr/](docs/adr/README.md)、弱点の知らせ方は [SECURITY.md](SECURITY.md)。今は骨組みと技術検証の段階で、使える画面はまだ無い。開発の手順は [AGENTS.md](AGENTS.md)。

## 注意

- ゲームのプロセス、メモリ、通信、ログ、画面、入力のどれにも触れない。時刻は利用者の操作だけで決まる ([ADR-0005](docs/adr/0005-never-touch-the-game.md))
- スクリプトと設定は利用者の端末の中にだけ置き、外に送らない。アクセス解析も入れていない
- 株式会社スクウェア・エニックスとは関係のない非公式のツールで、スクウェア・エニックスの承認・後援を受けたものではない。FINAL FANTASY XIV © SQUARE ENIX

## ライセンス

[AGPL-3.0-only](LICENSE)
