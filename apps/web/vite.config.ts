import { defineConfig } from "vite";

export default defineConfig({
  // E2E と手元の確認で同じポートを使う (playwright.config.ts)
  preview: { port: 4310, strictPort: true },
  server: { port: 4310 },
});
