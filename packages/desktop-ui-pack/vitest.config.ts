import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["ui/**/*.test.{ts,tsx}"], environment: "jsdom", setupFiles: ["./test/setup.tsx"] },
  esbuild: { jsx: "automatic" },
});
