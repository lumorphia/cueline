# 配信 (Cloudflare Workers)

本体は Worker `cueline` が、`apps/web` のビルドを静的アセットとして配る (ADR-0002)。サーバーの処理は無い。

| 項目         | 中身                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| URL          | https://cueline.dev-t1nyb0x.workers.dev (正式名が決まるまで。09-roadmap の公開ゲート) |
| 設定         | `wrangler.jsonc` (リポジトリの直下)                                                   |
| 応答ヘッダー | `apps/web/public/_headers`。E2E のサーバー (`e2e/serve.ts`) も同じファイルを読む      |
| ページの扱い | 拡張子の無いパスは `index.html` を返す (`single-page-application`)                    |
| 計測ページ   | 別の Worker `cueline-spikes` (`spikes/wrangler.jsonc`)。本体とは別に載せる            |

## 手で載せる

```sh
pnpm build
npx wrangler deploy                              # 本体
npx wrangler deploy -c spikes/wrangler.jsonc     # 計測ページ
```

`wrangler login` が要る (ブラウザで許可する)。手元のキャッシュ `.wrangler/` はコミットしない (`.gitignore` 済み)。

載せたら確かめる。反映まで 10〜20 秒かかることがある。

```sh
curl -sI https://cueline.dev-t1nyb0x.workers.dev/ | grep -i content-security-policy
```

## GitHub と繋ぐ (Workers Builds)

`main` への push で本番に載せ、PR ごとにプレビューの URL を作る。Cloudflare のダッシュボードで一度だけ行う。画面の名前は変わることがある。

1. Workers & Pages → `cueline` → Settings → Build → Git リポジトリを繋ぐ (`lumorphia/cueline`)
2. 本番のブランチ: `main`
3. ビルドのコマンド: `pnpm install --frozen-lockfile && pnpm build`
4. デプロイのコマンド: `npx wrangler deploy`
5. 本番以外のブランチのビルド: 有効。デプロイのコマンドは `npx wrangler versions upload` (版ごとのプレビュー URL ができる。`wrangler.jsonc` の `preview_urls`)

Node の版は `.node-version` を読む。pnpm の版は `package.json` の `packageManager`。

## 戻す

```sh
npx wrangler deployments list
npx wrangler rollback <version-id>
```
