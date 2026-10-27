import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{ test: { name: "native", include: ["src/**/*.test.ts", "test/**/*.test.ts"], environment: "node" } },
			{ test: { name: "ui", include: ["ui/**/*.test.{ts,tsx}"], environment: "jsdom", setupFiles: ["./test/setup.tsx"] }, esbuild: { jsx: "automatic" } },
		],
	},
});
