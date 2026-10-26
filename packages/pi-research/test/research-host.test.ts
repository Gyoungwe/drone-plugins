import { describe, expect, it } from "vitest";
import {
	createResearchHost,
	registerResearchHost,
	researchHostLoader,
	type ResearchHostPort,
} from "../src/host.js";

function port(): ResearchHostPort {
	const files = new Map<string, string>([
		["workspace:.pi/research-workspace.json", JSON.stringify({ resultsRoot: "results" })],
		["workspace:results/demo/run-1/metadata.json", JSON.stringify({
			run_id: "run-1", result_slug: "demo", project: "alpha", query: "test query", status: "running",
			updated_at: "2026-10-26T00:00:00Z", evidence_gate: { stage: "sources_inspected", answerable: false },
		})],
	]);
	const entries = new Map<string, readonly { name: string; kind: "directory" }[]>([
		["workspace:results", [{ name: "demo", kind: "directory" }]],
		["workspace:results/demo", [{ name: "run-1", kind: "directory" }]],
	]);
	return {
		async resolveRoot() { return { handle: "workspace" }; },
		async readText(root, path) {
			const value = files.get(`${root}:${path}`);
			if (value === undefined) {
				const error = new Error("missing") as Error & { code: string };
				error.code = "ENOENT";
				throw error;
			}
			return value;
		},
		async listFiles(root, path) { return entries.get(`${root}:${path}`) || []; },
	};
}

describe("research host adapter", () => {
	it("exposes status/listRuns through the versioned loader", async () => {
		const adapter = researchHostLoader.load(port());
		expect(adapter.contractVersion).toBe(1);
		expect(await adapter.operations.listRuns({ workspace: "/workspace", project: "alpha" })).toMatchObject({
			total: 1,
			items: [{ runId: "run-1", stage: "sources_inspected" }],
		});
		expect(await adapter.operations.status({ workspace: "/workspace", runDir: "demo/run-1" })).toMatchObject({
		item: { query: "test query", answerable: false },
		});
	});

	it("registers both read operations without side effects", async () => {
		const registered = new Map<string, unknown>();
		const adapter = registerResearchHost({ register(name, operation) { registered.set(name, operation); } }, port());
		expect([...registered.keys()]).toEqual(["status", "listRuns"]);
		expect(registered.get("status")).toBe(adapter.operations.status);
	});

	it("does not touch the host for application-independent construction", () => {
		let calls = 0;
		const adapter = createResearchHost({
			resolveRoot: async () => { calls += 1; return { handle: "workspace" }; },
			readText: async () => { calls += 1; return "{}"; },
			listFiles: async () => { calls += 1; return []; },
		});
		expect(adapter.contractVersion).toBe(1);
		expect(calls).toBe(0);
	});
});
