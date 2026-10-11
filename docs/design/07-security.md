# 07. 安全

サーバーも鍵も無いので、守るものは「利用者のブラウザ」と「利用者のデータ」。他人から受け取ったスクリプトや音声パックを読み込んでも、悪いことが起きないようにする。

## 脅威と対策

| 脅威                                               | 対策                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| スクリプトにコードを仕込む                         | スクリプトは宣言的なデータだけ。式も JavaScript も読まない。YAML の独自タグを受け付けない (ADR-0007)                               |
| 巨大なスクリプト・YAML の展開で止める              | 読む前の大きさ、エイリアスの数、深さ、件数の上限 (02)。超えたら読まない                                                            |
| 文字列で画面に HTML を差し込む                     | 文字列はすべて React のテキストとして出す。`dangerouslySetInnerHTML` を使わない (ESLint で止める)。Trusted Types を CSP で要求する |
| スクリプトから外のホストへ通信させる               | スクリプトは URL を持たない。通信先は利用者の設定 (VOICEVOX) だけ。CSP の `connect-src` で縛る                                     |
| 音声パックの zip 爆弾・巨大な音声                  | 展開後の大きさで数える上限 (04)。音声は `decodeAudioData` に渡す前に大きさを確かめる                                               |
| 他のサイトに埋め込まれて操作される                 | `frame-ancestors 'none'`                                                                                                           |
| 依存の脆弱性                                       | Renovate と `pnpm audit`。依存を足すときはライセンスも確かめる                                                                     |
| シークレットの混入 (public のリポジトリ、ADR-0003) | pre-commit と CI の gitleaks                                                                                                       |

## 応答ヘッダー (Cloudflare)

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self';
  img-src 'self' data: blob:;
  font-src 'self';
  media-src 'self' blob:;
  connect-src 'self' http://127.0.0.1:* http://localhost:*;
  worker-src 'self';
  manifest-src 'self';
  base-uri 'none';
  form-action 'none';
  frame-ancestors 'none';
  require-trusted-types-for 'script';
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), screen-wake-lock=(self)
Cross-Origin-Opener-Policy: same-origin
```

- `connect-src` に入れる外は、利用者の PC の上のポート (VOICEVOX) だけ。ポートは利用者が変えられるので `*` にする。外のホストへは出られない
- インラインのスクリプトとスタイルは使わない (Vite の出力をそのまま守る)。守れないものが出たら、ハッシュで許す
- ヘッダーは E2E で検証し、CSP の違反を全テストで見張る (prismtone の `e2e/test.ts` と同じやり方)

## 外への通信

- アプリの本体を取りに行く以外、外に出ない。計測 (アクセス解析、エラーの送信) も入れない。入れるときは、送るものと同意の取り方を ADR で決める
- VOICEVOX へは、利用者が設定画面で接続を確かめた接続先にだけ送る。送るのは読み上げの文と声の設定だけ

## 弱点の扱い

`SECURITY.md` の手順 (非公開の報告、セキュリティアドバイザリ、直してから公開)。
