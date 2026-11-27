import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["bench/**/*.bench.ts"],
		environment: "node",
		pool: "forks",
		fileParallelism: false,
		testTimeout: 30 * 60 * 1000,
	},
});
