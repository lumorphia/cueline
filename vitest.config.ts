import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "apps/*",
      // リポジトリ全体の決まり (ESLint の依存の向きなど)
      { test: { name: "repo", include: ["tooling/**/*.test.ts"] } },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["packages/*/src/**"],
      exclude: [
        "**/*.test.ts",
        // パッケージの入口 (export を並べるだけ)
        "packages/*/src/index.ts",
        // ブラウザの API に触れるアダプター (Web Speech、Worker、Wake Lock) は Playwright の E2E で確かめる
        "packages/*/src/**/*.browser.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
