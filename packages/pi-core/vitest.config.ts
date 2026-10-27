import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/task-runtime/*.test.mjs"], pool: "forks", maxWorkers: 4 } });
