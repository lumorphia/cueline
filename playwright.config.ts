import { defineConfig } from "@playwright/test";

const PORT = 4310;

/**
 * apps/web のビルドに対して E2E を回す。build は pnpm e2e が先に済ませる。
 * e2e/serve.ts が本番と同じ応答ヘッダー (apps/web/public/_headers) を付けて配る
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // 日本語の UI で書いたテストなので日本語で固定する
    locale: "ja-JP",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `PORT=${PORT} node e2e/serve.ts`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
