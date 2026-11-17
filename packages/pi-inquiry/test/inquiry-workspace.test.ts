import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import {
	planWorkspacePromotion,
	registerInquiryStorage,
	type WorkspaceRun,
	workspaceLayout,
} from "../src/index.js";
import { artifact } from "./helpers/inquiry-fixtures.js";

describe("workspace promotion", () => {
	it("plans move-only promotion and deterministic index paths", () => {
		const layout = workspaceLayout("/tmp/project");
		const run: WorkspaceRun = {
			id: "run-1",
			taskId: "task-1",
			root: "/tmp/project/runs/task-1/run-1",
			state: "frozen",
			createdAt: "2026-01-01T00:00:00.000Z",
		};
		const plan = planWorkspacePromotion({ layout, run, artifacts: [artifact()] });
		expect(plan.moves[0]?.from).toBe(resolvePath("/tmp/project", "runs/task-1/run-1/output.tsv"));
		expect(plan.moves[0]?.to).toBe(resolvePath("/tmp/project", "results/task-1/run-1/output.tsv"));
		expect(plan.indexEntries[0]?.resultPath).toBe("results/task-1/run-1/output.tsv");
	});
});

it("registers both inquiry storage paths through a host-shaped registry", () => {
	const entries: unknown[] = [];
	registerInquiryStorage({ register: (entry) => entries.push(entry) }, "/tmp/project/.drone");
	expect(entries).toHaveLength(2);
	expect(entries).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ id: "inquiry-root" }),
			expect.objectContaining({ id: "inquiry-ledger" }),
		]),
	);
});
