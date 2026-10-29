import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import createDesktopRuntime from "../src/desktop/runtime.js";

function enoent(path: string): Error & { code: string } {
	const error = new Error(`missing ${path}`) as Error & { code: string };
	error.code = "ENOENT";
	return error;
}

async function harness(rootPath: string) {
	const roots = new Map([["workspace", rootPath]]);
	const capabilities = {
		async call(name: string, input: any): Promise<unknown> {
			if (name === "roots.resolve") return { handle: "workspace" };
			const root = roots.get(input.root);
			if (!root) throw new Error("unknown root");
			const path = join(root, input.path || "");
			if (name === "files.readText") {
				try { return { text: await readFile(path, "utf8") }; }
				catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw enoent(input.path); throw error; }
			}
			if (name === "files.list") {
				try {
					return (await readdir(path, { withFileTypes: true })).map(entry => ({
						name: entry.name,
						kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
					}));
				} catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw enoent(input.path); throw error; }
			}
			throw new Error(`unexpected capability ${name}`);
		},
	};
	const runtime = await createDesktopRuntime({
		applicationId: "test",
		signal: new AbortController().signal,
		resources: [],
		capabilities,
		events: { changed: () => {} },
	});
	const context = {
		capabilities,
		scope: { kind: "workspace" as const, workspaceId: "workspace", workspaceDirectory: rootPath },
		signal: new AbortController().signal,
	};
	return { runtime, context };
}

describe("pi-research Desktop runtime", () => {
	it("lists and reads a run through host-granted capabilities", async () => {
		const root = await mkdtemp(join(tmpdir(), "drone-research-desktop-"));
		const run = join(root, "results", "demo", "run-20261026-abc");
		await mkdir(run, { recursive: true });
		await writeFile(join(run, "metadata.json"), JSON.stringify({
			run_id: "run-20261026-abc", result_slug: "demo", project: "demo", query: "find evidence",
			status: "running", updated_at: "2026-10-26T00:01:00Z",
			evidence_gate: { stage: "sources_inspected", answerable: false },
		}));
		const { runtime, context } = await harness(root);
		const listed = await runtime.operations.listRuns.execute({ project: "demo" }, context);
		expect(listed).toMatchObject({ total: 1, items: [{ runId: "run-20261026-abc", stage: "sources_inspected" }] });
		const status = await runtime.operations.status.execute({ runDir: "demo/run-20261026-abc" }, context);
		expect(status).toMatchObject({ item: { query: "find evidence", answerable: false } });
	});

	it("rejects application scope and traversal before any file read", async () => {
		const root = await mkdtemp(join(tmpdir(), "drone-research-desktop-"));
		const { runtime } = await harness(root);
		const calls: string[] = [];
		const context = {
			capabilities: { call: async (name: string) => { calls.push(name); throw new Error("unexpected"); } },
			scope: { kind: "application" as const },
			signal: new AbortController().signal,
		};
		await expect(runtime.operations.status.execute({}, context)).rejects.toThrow("selected workspace");
		expect(calls).toEqual([]);
		const { runtime: scopedRuntime, context: workspaceContext } = await harness(root);
		await expect(scopedRuntime.operations.status.execute({ runDir: "../outside/run-1" }, workspaceContext)).rejects.toThrow("inside");
	});
});
