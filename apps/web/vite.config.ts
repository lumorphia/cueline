import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { precacheList } from "./src/pwa/strategy.ts";

const here = import.meta.dirname;

function filesIn(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? filesIn(full, base)
      : [path.relative(base, full).split(path.sep).join("/")];
  });
}

/**
 * Service Worker (src/pwa/service-worker.ts) を /sw.js として出し、この版のファイルの一覧を埋め込む。
 * 一覧が変わると cache の名前も変わり、ブラウザが新しい版として入れる (要件 NFR-201)
 */
function serviceWorker(): Plugin {
  return {
    name: "cueline-service-worker",
    apply: "build",
    // index.html は Vite の HTML のプラグインが出すので、その後に動く
    enforce: "post",
    generateBundle(_options, bundle) {
      const publicFiles = filesIn(path.join(here, "public"));
      const list = precacheList([...Object.keys(bundle), ...publicFiles]);
      const sw = bundle["sw.js"];
      if (!sw || sw.type !== "chunk") throw new Error("sw.js が出力に無い");
      // 圧縮で引用符がバッククォートに変わることがあるので、どの引用符でも置き換える。置き換わらなければ止める
      const placeholder = /(["'`])__TC_PRECACHE__\1/;
      if (!placeholder.test(sw.code)) throw new Error("sw.js に __TC_PRECACHE__ が無い");
      sw.code = sw.code.replace(placeholder, JSON.stringify(JSON.stringify(list)));
    },
  };
}

export default defineConfig({
  // E2E と手元の確認で同じポートを使う (playwright.config.ts)
  preview: { port: 4310, strictPort: true },
  server: { port: 4310 },
  // タイマーの Worker は module Worker として起こす (timer/worker-timer.ts)
  worker: { format: "es" },
  build: {
    rollupOptions: {
      input: {
        index: path.join(here, "index.html"),
        sw: path.join(here, "src/pwa/service-worker.ts"),
      },
      output: {
        // Service Worker は決まった名前 (/sw.js) で置く。ブラウザはこの URL の中身が変わったかで更新を知る
        entryFileNames: (chunk) => (chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"),
      },
    },
  },
  plugins: [tailwindcss(), serviceWorker()],
});
