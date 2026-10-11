import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "speech", include: ["src/**/*.test.ts"], passWithNoTests: true },
});
