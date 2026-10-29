export default {
	test: {
		include: ["test/**/*.test.ts"],
		pool: "forks",
		maxWorkers: 1,
		minWorkers: 1,
	},
};
