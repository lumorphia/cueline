import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // E2E と手元の確認で同じポートを使う (playwright.config.ts)
  preview: { port: 4310, strictPort: true },
  server: { port: 4310 },
  // タイマーの Worker は module Worker として起こす (timer/worker-timer.ts)
  worker: { format: "es" },
  plugins: [tailwindcss()],
});
