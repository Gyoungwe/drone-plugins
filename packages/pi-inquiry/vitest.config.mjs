export default {
	test: {
		pool: "forks",
		maxWorkers: 1,
		minWorkers: 1,
		projects: [
			{ test: { name: "node", include: ["test/**/*.test.ts"] } },
			{
				test: {
					name: "ui",
					include: ["test/ui/**/*.test.tsx"],
					environment: "jsdom",
					setupFiles: ["test/ui/setup.tsx"],
				},
				esbuild: { jsx: "automatic" },
			},
		],
	},
};
