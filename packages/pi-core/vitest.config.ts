import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		pool: "forks",
		maxWorkers: 4,
		projects: [
			{ test: { name: "runtime", include: ["test/task-runtime/*.test.mjs"] } },
			{
				test: {
					name: "ui",
					include: ["ui/**/*.test.{ts,tsx}"],
					environment: "jsdom",
					setupFiles: ["test/ui-setup.tsx"],
				},
				esbuild: { jsx: "automatic" },
			},
		],
	},
});
