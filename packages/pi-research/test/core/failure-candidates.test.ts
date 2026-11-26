import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { LiteratureReceipt } from "../../src/core/literature-receipt.js";
import { createResearchLoop } from "../../src/core/research-loop.js";
import { registerEvidenceLoop } from "../../src/evidence-loop.js";
import type { Context, Tool } from "../../src/research-loop-tool.js";

const directories: string[] = [];
const privateQuery =
	"Bearer fixture-secret https://fixture-user@example.invalid/search?token=fixture#private";

afterEach(async () => {
	for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function fixture(requiresProvenance = false) {
	const cwd = await realpath(await mkdtemp(join(tmpdir(), "research-failure-candidates-")));
	directories.push(cwd);
	const record = vi.fn(async (_input: unknown) => undefined);
	const sourceStatus = vi.fn(async (): Promise<unknown> => ({}));
	const verifyLiteratureReceipt = vi.fn(async (): Promise<LiteratureReceipt> => {
		throw new Error("Unexpected literature verification");
	});
	const ports = {
		resolveProject: async () => "fixture",
		workspace: async () => ({ resultsRoot: join(cwd, "results"), obsidianVault: cwd }),
		verifyLiteratureReceipt,
		sourceStatus,
		breakerBudget: { maxBilledTokens: 5 },
		failureCandidateSink: { record },
	};
	const loop = createResearchLoop(ports);
	const started = await loop.startResearchRun({ cwd, query: privateQuery, requiresProvenance });
	return {
		loop,
		cwd,
		runDir: started.run_dir,
		runId: started.metadata.run_id,
		record,
		sourceStatus,
		verifyLiteratureReceipt,
	};
}

it("emits an opaque reference to a new, saved breaker receipt once", async () => {
	const { loop, cwd, runDir, runId, record } = await fixture();
	const sample = { reported: true, inputTokens: 5, outputTokens: 0, cacheWriteTokens: 0 };
	await loop.observeUsage(cwd, runDir, sample);
	await loop.observeUsage(cwd, runDir, sample);
	const status = await loop.updateResearchLoop({ cwd, runDir, action: "status" });
	const breaker = status.metadata.breaker_receipt;
	expect(breaker).toBeDefined();
	expect(record).toHaveBeenCalledTimes(1);
	expect(record).toHaveBeenCalledWith({
		failureCode: "breaker:budget-exceeded",
		subject: "Research limits",
		scopeKind: "project",
		summary: "Research stopped after reaching its configured limit.",
		provenance: {
			sourcePlugin: "drone-pi-research",
			producer: "research-loop",
			runId,
			receiptId: breaker?.id,
			breakerReceiptId: breaker?.id,
		},
	});
	expect(JSON.stringify(record.mock.calls)).not.toMatch(/fixture-secret|example\.invalid|token=|#private/);
});

it.each([
	["no-available-source", {}, "No available source"],
	[
		"archive-verify-failed",
		{ verification: { ok: false, items: [{ ok: false, reason: privateQuery }] } },
		"Archived source verification failed",
	],
] as const)(
	"reports %s without changing the research error when recording fails",
	async (failureCode, archive, message) => {
		const { loop, cwd, runDir, runId, record, sourceStatus } = await fixture();
		const scope = { cwd, runDir };
		sourceStatus.mockResolvedValue(archive);
		await loop.updateResearchLoop({ ...scope, action: "record_local", query: privateQuery });
		await loop.updateResearchLoop({ ...scope, action: "record_external", query: privateQuery });
		await loop.updateResearchLoop({ ...scope, action: "inspect_sources", sourceRefs: [privateQuery] });
		record.mockRejectedValueOnce(new Error("Unexpected diagnostic write failure"));
		await expect(loop.updateResearchLoop({ ...scope, action: "verify_archive" })).rejects.toThrow(message);
		expect(record).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				failureCode,
				provenance: expect.objectContaining({
					producer: "research-loop",
					runId,
					receiptId: expect.any(String),
				}),
			}),
		);
		expect(JSON.stringify(record.mock.calls)).not.toMatch(/fixture-secret|example\.invalid|token=|#private/);
	},
);

async function runWithReusedNote(requiresProvenance = false) {
	const run = await fixture(requiresProvenance);
	const { loop, cwd, runDir, verifyLiteratureReceipt } = run;
	const path = "Library/Papers/private-note.md";
	const text = `# Fixture paper\n${privateQuery}\nResult and limitations.`;
	const hash = createHash("sha256").update(text).digest("hex");
	const proof: LiteratureReceipt = {
		doi: "10.1234/fixture",
		zoteroKey: "ABCDEFGH",
		status: "both-verified",
		scientificallyVerified: false,
		obsidian: { status: "verified", path, vault: cwd, hash },
		zotero: { status: "verified" },
	};
	await mkdir(join(cwd, "Library", "Papers"), { recursive: true });
	await writeFile(join(cwd, path), text);
	verifyLiteratureReceipt.mockResolvedValue(proof);
	await loop.observeResearchReceipt({
		cwd,
		runDir,
		toolName: "research_read_knowledge",
		args: { path },
		details: { path, text, hash, startLine: 1, endLine: 3 },
	});
	await loop.observeResearchReceipt({
		cwd,
		runDir,
		toolName: "research_verify_literature",
		details: { ...proof },
	});
	const claimBindings = [
		{
			claim: "Limited fixture result",
			relationship: "direct",
			limitations: "Fixture only",
			sources: [{ path, start_line: 3, end_line: 3, quote: "Result and limitations." }],
		},
	];
	return { ...run, proof, complete: () => loop.completeResearchGate({ cwd, runDir, claimBindings }) };
}

it("reports a reused source that no longer matches its read receipt", async () => {
	const { complete, proof, record, verifyLiteratureReceipt } = await runWithReusedNote();
	verifyLiteratureReceipt.mockResolvedValue({ ...proof, obsidian: { ...proof.obsidian, hash: "updated" } });
	await expect(complete()).rejects.toThrow("Reused source changed");
	expect(record).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ failureCode: "reused-source-changed" }),
	);
	expect(JSON.stringify(record.mock.calls)).not.toContain("private-note.md");
});

it("reports a missing reproducibility manifest after source and claim verification", async () => {
	const { complete, record } = await runWithReusedNote(true);
	await expect(complete()).rejects.toThrow("requires a reproducibility manifest");
	expect(record).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ failureCode: "missing-provenance-manifest" }),
	);
});

it("reports local evidence failures while preserving tool results and errors when the sink fails", async () => {
	const { cwd, record } = await fixture();
	const sourceDir = join(cwd, "research-sources");
	const sourceFile = join(sourceDir, "private-library-note.md");
	const tools = new Map<string, Omit<Tool, "executionMode">>();
	const ctx: Context = { cwd };
	const signal = new AbortController().signal;
	async function execute(name: string, params: Record<string, unknown>) {
		const tool = tools.get(`research_${name}`);
		if (!tool) throw new Error(`Missing evidence tool ${name}`);
		return tool.execute(privateQuery, params, signal, undefined, ctx);
	}
	await mkdir(sourceDir);
	await writeFile(sourceFile, `---\nid: sample\nurl: ${privateQuery}\n---\nA searchable source.\n`);
	registerEvidenceLoop(
		{ registerTool: (tool: Omit<Tool, "executionMode">) => tools.set(tool.name, tool) },
		{ failureCandidateSink: { record } },
	);
	record.mockRejectedValue(new Error("Diagnostic service unavailable"));
	await expect(execute("search_sources", { query: "nomatch" })).resolves.toMatchObject({
		details: { count: 0 },
	});
	await execute("search_sources", { query: "searchable" });
	await writeFile(sourceFile, "---\nid: sample\n---\nA searchable source with changed bytes.\n");
	await expect(execute("read_source", { source_id: "sample" })).rejects.toThrow(
		"source changed after search",
	);
	await execute("search_sources", { query: "searchable" });
	await execute("read_source", { source_id: "sample" });
	await expect(
		execute("answer_sources", { question: privateQuery, source_ids: ["sample", "sample"] }),
	).rejects.toThrow("at least two distinct read sources");
	expect(record.mock.calls.map(([input]) => input)).toEqual([
		expect.objectContaining({ failureCode: "zero-local-hits" }),
		expect.objectContaining({ failureCode: "source-changed-mid-read" }),
		expect.objectContaining({ failureCode: "insufficient-distinct-sources" }),
	]);
	expect(JSON.stringify(record.mock.calls)).not.toMatch(
		/fixture-secret|example\.invalid|private-library-note/,
	);
});
