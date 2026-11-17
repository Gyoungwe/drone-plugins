import { vi } from "vitest";
import type { ArtifactRecord } from "../../src/index.js";

// Legacy SQLite fixtures spawn a child Node process on Windows. Native process
// startup and file I/O can exceed Vitest's 5 s default on hosted runners even
// though the test itself is bounded and deterministic.
vi.setConfig({
	testTimeout: process.platform === "win32" ? 30_000 : 5_000,
	hookTimeout: process.platform === "win32" ? 30_000 : 10_000,
});

const digest = "a".repeat(64);
export const artifact = (overrides: Partial<ArtifactRecord> = {}): ArtifactRecord => ({
	id: "artifact-1",
	schemaVersion: 1,
	projectId: "project-1",
	location: "local",
	path: "runs/task-1/run-1/output.tsv",
	bytes: 10,
	sha256: digest,
	source: { kind: "run", id: "run-1" },
	purpose: "deliverable",
	status: "valid",
	parentIds: [],
	runId: "run-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});
