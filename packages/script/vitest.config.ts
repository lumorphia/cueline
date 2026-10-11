import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "script", include: ["src/**/*.test.ts"], passWithNoTests: true },
});
