import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createResearchLoop } from "../../src/core/research-loop.js";
import { createResearchReceiptJournal as createJournal } from "../../src/core/receipt-journal.js";
import { observeExecutionReceipt } from "../../src/core/run-provenance.js";
import { sourceStatus } from "../../src/core/source-archive.js";
import { verifyLiteratureReceipt } from "../../src/core/literature-receipt.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
let loop, config, owners;
const workspace = async () => config;
const saveWorkspaceConfig = async (_cwd, patch) => {
	Object.assign(config, patch);
};
const startResearchRun = (input) => loop.startResearchRun(input);
const updateResearchLoop = (input) => loop.updateResearchLoop(input);
const observeResearchReceipt = (input) => loop.observeResearchReceipt(input);
const completeResearchGate = (input) => loop.completeResearchGate(input);
const resetResearchReceipts = (input) => loop.resetResearchReceipts(input);
function createResearchReceiptJournal(cwd) {
	return createJournal(cwd, {
		ports: {
			workspace,
			status: (cwd, runDir) => loop.updateResearchLoop({ cwd, runDir, action: "status" }),
			flush: (cwd, runDir) => loop.flushResearchReceipts({ cwd, runDir }),
			reset: (cwd, runDir) => loop.resetResearchReceipts({ cwd, runDir }),
			observeExecution: observeExecutionReceipt,
			observeResearch: (event) => loop.observeResearchReceipt(event),
			isJournalTool: () => true,
			owners,
		},
	});
}

let journals = [];
let cwd, runDir;
beforeEach(async () => {
	vi.stubEnv("DRONE_KNOWLEDGE_DIR", undefined);
	vi.stubEnv("PI_RESEARCH_DESKTOP_CONFIG", undefined);
	cwd = await realpath(await mkdtemp(join(tmpdir(), "drone-research-loop-")));
	await mkdir(join(cwd, "results"), { recursive: true });
	config = { resultsRoot: join(cwd, "results"), obsidianVault: null, knowledgeBindingRevision: 0 };
	owners = new Map();
	const archivePorts = { workspace, publishSourceNote: async () => ({}), exclusive: (_key, work) => work() };
	loop = createResearchLoop({
		workspace,
		resolveProject: async () => "host-project",
		verifyLiteratureReceipt,
		sourceStatus: (input) => sourceStatus(input, archivePorts),
	});
	const started = await startResearchRun({
		cwd,
		project: "research-workbench",
		resultSlug: "loop-fixture",
		query: "How does DESeq2 normalize counts?",
	});
	runDir = started.run_dir;
});
afterEach(async () => {
	for (const j of journals) await j.close();
	journals = [];
	resetResearchReceipts({ cwd, runDir });
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	await rm(cwd, { recursive: true, force: true });
});

async function seedArchive() {
	const sources = join(runDir, "sources");
	await mkdir(join(sources, "papers"), { recursive: true });
	const file = join(sources, "papers", "paper.pdf");
	await writeFile(file, "fixture-pdf");
	await writeFile(
		join(sources, "download-manifest.json"),
		`${JSON.stringify({
			items: [
				{
					id: "src-1",
					status: "downloaded",
					sha256: createHash("sha256").update("fixture-pdf").digest("hex"),
					size_bytes: "fixture-pdf".length,
					path: file,
					url: "https://example.test/p",
				},
			],
			failures: [],
		})}\n`,
	);
}

it("records a successful knowledge search as the local query without a manual research_loop call", async () => {
	const observed = await observeResearchReceipt({
		cwd,
		runDir,
		toolName: "research_search_knowledge",
		args: { query: "DESeq2 size factors" },
		details: { query: "DESeq2 size factors", complete: true, hits: [{ path: "Library/Methods/deseq2.md" }] },
	});
	expect(observed.evidence_gate.stage).toBe("local_query_recorded");
});

it("advances inspection from a non-Wiki read and does not throw without a prior web search", async () => {
	await observeResearchReceipt({
		cwd,
		runDir,
		toolName: "research_search_knowledge",
		args: { query: "DESeq2" },
		details: { complete: true, query: "DESeq2" },
	});
	const observed = await observeResearchReceipt({
		cwd,
		runDir,
		toolName: "research_read_knowledge",
		args: { path: "Library/Methods/deseq2.md" },
		details: { path: "Library/Methods/deseq2.md", missing: false },
	});
	expect(observed.evidence_gate.stage).toBe("sources_inspected");
	expect(observed.evidence_gate.source_refs).toContain("Library/Methods/deseq2.md");
});

it("ignores Wiki reads and failed tools", async () => {
	expect(
		await observeResearchReceipt({
			cwd,
			runDir,
			toolName: "research_read_knowledge",
			args: { path: "Wiki/rna-seq.md" },
			details: { path: "Wiki/rna-seq.md" },
		}),
	).toBeNull();
	expect(
		await observeResearchReceipt({
			cwd,
			runDir,
			toolName: "research_search_knowledge",
			args: { query: "x" },
			isError: true,
		}),
	).toBeNull();
});

it("closes the gate in one host-serial complete after a verified archive", async () => {
	await seedArchive();
	const p = await localPaper("archived", "ARCHIV01");
	await noteRead(p);
	await identity(p);
	await updateResearchLoop({
		cwd,
		runDir,
		action: "record_local",
		query: "DESeq2",
	});
	await updateResearchLoop({
		cwd,
		runDir,
		action: "record_external",
		notes: "used local notes",
	});
	await updateResearchLoop({
		cwd,
		runDir,
		action: "inspect_sources",
		sourceRefs: ["https://example.test/p"],
	});
	await expect(completeResearchGate({ cwd, runDir, claimRefs: ["legacy claim"] })).rejects.toThrow(
		"structured claim_bindings",
	);
	await expect(completeResearchGate({ cwd, runDir })).rejects.toThrow("structured claim_bindings");
	const done = await completeResearchGate({
		cwd,
		runDir,
		claimBindings: [binding(p, "Explicit limited claim")],
	});
	expect(done.evidence_gate.stage).toBe("answerable");
	expect(done.evidence_gate.answerable).toBe(true);
	expect(done.evidence_gate.archive_count).toBe(1);
	expect(done.evidence_gate.claim_refs[0]).toMatch(/^Explicit limited claim/);
	const metadata = JSON.parse(await readFile(join(runDir, "metadata.json"), "utf8"));
	expect(metadata.status).toBe("completed");
	expect(metadata.research_nodes).toHaveLength(8);
	expect(metadata.research_nodes.every((node) => node.state === "completed")).toBe(true);
	expect(metadata.provenance).toMatchObject({ status: "host-verified", claim_bindings: expect.any(Array) });
});

it("rejects an archived source after its bytes change", async () => {
	await seedArchive();
	await updateResearchLoop({ cwd, runDir, action: "record_local", query: "DESeq2" });
	await updateResearchLoop({ cwd, runDir, action: "record_external", notes: "used local notes" });
	await updateResearchLoop({
		cwd,
		runDir,
		action: "inspect_sources",
		sourceRefs: ["https://example.test/p"],
	});
	await writeFile(join(runDir, "sources", "papers", "paper.pdf"), "tampered-pdf");
	await expect(
		completeResearchGate({ cwd, runDir, claimBindings: [unboundClaimBinding("tampered claim")] }),
	).rejects.toThrow("sha256 mismatch");
});

it("archive download receipts record acquisition but never auto-bind claims or finalize", async () => {
	await seedArchive();
	const observed = await observeResearchReceipt({
		cwd,
		runDir,
		toolName: "research_archive_source",
		args: { run_dir: runDir, url: "https://example.test/p", category: "papers" },
		details: {
			status: "downloaded",
			path: join(runDir, "sources", "papers", "paper.pdf"),
			url: "https://example.test/p",
		},
	});
	expect(observed.evidence_gate.stage).toBe("sources_archived");
	expect(observed.evidence_gate.answerable).toBe(false);
	expect(observed.evidence_gate.claim_refs).toEqual([]);
	const metadata = JSON.parse(await readFile(join(runDir, "metadata.json"), "utf8"));
	expect(metadata.evidence_gate.stage).toBe("sources_archived");
});

it("binds a structured claim to a read archived run source", async () => {
	const sources = join(runDir, "sources", "papers");
	await mkdir(sources, { recursive: true });
	const sourcePath = join(sources, "paper.md");
	const text = "# Archived source\nThe bounded result is reproducible.\n";
	await writeFile(sourcePath, text);
	const sourceHash = createHash("sha256").update(text).digest("hex");
	await writeFile(
		join(runDir, "sources", "download-manifest.json"),
		`${JSON.stringify({ items: [{ id: "source-1", status: "downloaded", sha256: sourceHash, path: sourcePath }], failures: [] })}\n`,
	);
	await observeResearchReceipt({
		cwd,
		runDir,
		toolName: "research_archive_source",
		args: { run_dir: runDir, url: "https://example.test/p" },
		details: { status: "downloaded", path: sourcePath, url: "https://example.test/p" },
	});
	await observeResearchReceipt({
		cwd,
		runDir,
		toolName: "read",
		args: { path: relative(cwd, sourcePath) },
		details: { path: relative(cwd, sourcePath) },
		content: [{ type: "text", text }],
	});
	const done = await completeResearchGate({
		cwd,
		runDir,
		claimBindings: [
			{
				claim: "The bounded result is reproducible",
				relationship: "direct",
				limitations: "fixture only",
				sources: [
					{
						path: relative(cwd, sourcePath),
						start_line: 2,
						end_line: 2,
						quote: "The bounded result is reproducible.",
					},
				],
			},
		],
	});
	expect(done.evidence_gate.answerable).toBe(true);
	expect(done.evidence_gate.claim_bindings[0].sources[0]).toMatchObject({ hash: sourceHash });
});

async function localPaper(name = "paper", key = "ABCDEFGH") {
	const vault = join(cwd, "Vault");
	await mkdir(join(vault, "Library/Papers"), { recursive: true });
	await saveWorkspaceConfig(cwd, { obsidianVault: vault });
	const path = `Library/Papers/${name}.md`,
		doi = `10.1038/${name}`;
	const text = `# Paper\n${doi}\nzotero:${key}\nResult and limitations.`;
	await writeFile(join(vault, path), text);
	const hash = createHash("sha256").update(text).digest("hex");
	vi.stubGlobal("fetch", async (url) => ({
		ok: true,
		json: async () => (url.endsWith("/children") ? [] : { data: { DOI: doi } }),
	}));
	const proof = await verifyLiteratureReceipt({ doi, zotero_key: key, note_path: path, vault });
	return { vault, path, text, hash, proof };
}
function unboundClaimBinding(claim = "Limited claim") {
	return {
		claim,
		relationship: "hypothesis",
		limitations: "fixture claim requires human review",
		sources: [],
	};
}
async function noteRead(p, overrides = {}) {
	return observeResearchReceipt({
		cwd,
		runDir,
		toolName: "research_read_knowledge",
		args: { path: p.path },
		details: { path: p.path, text: p.text, hash: p.hash, startLine: 1, endLine: 4, ...overrides },
	});
}
async function identity(p, overrides = {}) {
	return observeResearchReceipt({
		cwd,
		runDir,
		toolName: "research_verify_literature",
		details: { ...p.proof, ...overrides },
	});
}
function binding(p, claim = "Limited method claim") {
	return {
		claim,
		relationship: "direct",
		limitations: "fixture only",
		sources: [{ path: p.path, start_line: 4, end_line: 4, quote: "Result and limitations." }],
	};
}
it("rechecks a completed run before delivery and binds actual written bytes", async () => {
	const p = await localPaper();
	await noteRead(p);
	await identity(p);
	await completeResearchGate({ cwd, runDir, claimBindings: [binding(p)] });
	const prepared = await loop.prepareResearchDelivery({ cwd, runDir, markdown: "Limited result. " });
	const summary = join(runDir, "SUMMARY.md");
	await writeFile(summary, prepared.body);
	const receipt = await loop.commitResearchDelivery({
		cwd,
		runDir,
		prepared,
		copies: [{ role: "run", path: summary }],
	});
	expect(receipt).toMatchObject({
		bodySha256: createHash("sha256")
			.update(await readFile(summary))
			.digest("hex"),
		scientificallyVerified: false,
	});
	await writeFile(join(p.vault, p.path), `${p.text}\nChanged after complete.`);
	await expect(loop.prepareResearchDelivery({ cwd, runDir, markdown: "Another summary" })).rejects.toThrow(
		/changed|not read/,
	);
	expect(await readFile(summary, "utf8")).toBe(prepared.body);
});

it("does not commit stale or mismatched summary readback", async () => {
	const p = await localPaper();
	await noteRead(p);
	await identity(p);
	await completeResearchGate({ cwd, runDir, claimBindings: [binding(p)] });
	const prepared = await loop.prepareResearchDelivery({ cwd, runDir, markdown: "Limited result." });
	const summary = join(runDir, "SUMMARY.md");
	await writeFile(summary, "Different body\n");
	await expect(
		loop.commitResearchDelivery({ cwd, runDir, prepared, copies: [{ role: "run", path: summary }] }),
	).rejects.toThrow("readback differs");
	expect(JSON.parse(await readFile(join(runDir, "metadata.json"), "utf8")).delivery_receipt).toBeUndefined();
	resetResearchReceipts({ cwd, runDir });
	await expect(loop.prepareResearchDelivery({ cwd, runDir, markdown: "Limited result." })).rejects.toThrow(
		/changed|receipt|not read/,
	);
});

it("keeps disjoint observed ranges without inventing the unread gap", async () => {
	const p = await localPaper();
	await noteRead(p, { startLine: 1, endLine: 1, text: "# Paper" });
	await noteRead(p, { startLine: 4, endLine: 4, text: "Result and limitations." });
	await identity(p);
	const first = {
		...binding(p, "The title is Paper"),
		sources: [{ path: p.path, start_line: 1, end_line: 1, quote: "# Paper" }],
	};
	const done = await completeResearchGate({ cwd, runDir, claimBindings: [first, binding(p)] });
	expect(done.evidence_gate.claim_bindings.map((claim) => claim.sources[0].read_receipt_id)).toHaveLength(2);
	expect(done.evidence_gate.claim_bindings[0].sources[0].read_receipt_id).not.toBe(
		done.evidence_gate.claim_bindings[1].sources[0].read_receipt_id,
	);
	await expect(
		completeResearchGate({
			cwd,
			runDir,
			claimBindings: [
				{ ...first, sources: [{ path: p.path, start_line: 1, end_line: 4, quote: "# Paper" }] },
			],
		}),
	).rejects.toThrow("unread gaps");
	await expect(
		completeResearchGate({
			cwd,
			runDir,
			claimBindings: [
				{ ...first, sources: [{ path: p.path, start_line: 2, end_line: 2, quote: p.proof.doi }] },
			],
		}),
	).rejects.toThrow("outside the observed read");
});

it("keeps earlier archive reads when a later read uses another alias of the same path", async () => {
	const path = join(runDir, "sources", "ranges.md"),
		text = "One\nUnread two\nUnread three\nFour\n";
	await mkdir(join(runDir, "sources"), { recursive: true });
	await writeFile(path, text);
	await writeFile(
		join(runDir, "sources", "download-manifest.json"),
		JSON.stringify({
			items: [
				{ id: "ranges", path, status: "downloaded", sha256: createHash("sha256").update(text).digest("hex") },
			],
			failures: [],
		}),
	);
	await observeResearchReceipt({
		cwd,
		runDir,
		toolName: "research_archive_source",
		args: { run_dir: runDir, url: "https://example.test/ranges" },
		details: { status: "downloaded", path },
	});
	for (const [offset, shown, alias] of [
		[1, "One", relative(cwd, path)],
		[4, "Four", `./${relative(cwd, path)}`],
	]) {
		await observeResearchReceipt({
			cwd,
			runDir,
			toolName: "read",
			args: { path: alias, offset, limit: 1 },
			details: {},
			content: [{ type: "text", text: shown }],
		});
	}
	const done = await completeResearchGate({
		cwd,
		runDir,
		claimBindings: [
			{
				claim: "First",
				relationship: "direct",
				limitations: "test only",
				sources: [{ path, start_line: 1, end_line: 1, quote: "One" }],
			},
			{
				claim: "Last",
				relationship: "direct",
				limitations: "test only",
				sources: [{ path, start_line: 4, end_line: 4, quote: "Four" }],
			},
		],
	});
	expect(done.evidence_gate.claim_bindings).toHaveLength(2);
	const revised = `${text}Additional context\n`;
	await writeFile(path, revised);
	await writeFile(
		join(runDir, "sources", "download-manifest.json"),
		JSON.stringify({
			items: [
				{
					id: "ranges",
					path,
					status: "downloaded",
					sha256: createHash("sha256").update(revised).digest("hex"),
				},
			],
			failures: [],
		}),
	);
	await observeResearchReceipt({
		cwd,
		runDir,
		toolName: "read",
		args: { path },
		details: {},
		content: [{ type: "text", text: revised }],
	});
	await expect(loop.prepareResearchDelivery({ cwd, runDir, markdown: "First and last." })).rejects.toThrow(
		"Claim evidence changed",
	);
	await completeResearchGate({ cwd, runDir });
	expect(
		(await loop.prepareResearchDelivery({ cwd, runDir, markdown: "First and last." })).claims,
	).toHaveLength(2);
});
it("reuses actual current-turn note reads without pretending to archive PDFs", async () => {
	const p = await localPaper();
	await noteRead(p);
	await identity(p);
	await expect(completeResearchGate({ cwd, runDir })).rejects.toThrow("structured claim_bindings");
	const done = await completeResearchGate({
		cwd,
		runDir,
		claimBindings: [binding(p)],
	});
	expect(done.evidence_gate).toMatchObject({
		answerable: true,
		archive_count: 0,
		reuse_count: 1,
		scientificallyVerified: false,
	});
	expect(done.evidence_gate.reused_sources[0]).toMatchObject({
		hash: p.hash,
		fulltext_status: "metadata-only",
		originalFulltextReadThisTurn: false,
	});
});
it("identity alone, Wiki and empty read ranges do not establish reuse", async () => {
	const p = await localPaper();
	await identity(p);
	await expect(completeResearchGate({ cwd, runDir, claimRefs: ["claim"] })).rejects.toThrow();
	await noteRead(p, { text: "" });
	await expect(updateResearchLoop({ cwd, runDir, action: "verify_archive" })).rejects.toThrow(
		"No available source",
	);
	await noteRead(p, { startLine: 20, endLine: 19 });
	await expect(updateResearchLoop({ cwd, runDir, action: "verify_archive" })).rejects.toThrow(
		"No available source",
	);
});
it("changed or replayed notes cannot finalize with old receipts", async () => {
	const p = await localPaper();
	await noteRead(p);
	await identity(p);
	await writeFile(join(p.vault, p.path), `${p.text} Changed`);
	await expect(completeResearchGate({ cwd, runDir, claimRefs: ["claim"] })).rejects.toThrow("changed");
	await writeFile(join(p.vault, p.path), p.text);
	resetResearchReceipts({ cwd, runDir });
	await expect(completeResearchGate({ cwd, runDir, claimRefs: ["claim"] })).rejects.toThrow(
		"receipt is missing",
	);
});
it("binding changes cannot reuse a same-named note", async () => {
	const p = await localPaper();
	await noteRead(p);
	await identity(p);
	const other = join(cwd, "OtherVault");
	await mkdir(join(other, "Library/Papers"), { recursive: true });
	await writeFile(join(other, p.path), p.text);
	await saveWorkspaceConfig(cwd, { obsidianVault: other });
	await expect(completeResearchGate({ cwd, runDir, claimRefs: ["claim"] })).rejects.toThrow("changed");
});
it("failed or partial dual-library results do not count", async () => {
	const p = await localPaper();
	await noteRead(p);
	await identity(p, { status: "partial" });
	await expect(updateResearchLoop({ cwd, runDir, action: "verify_archive" })).rejects.toThrow(
		"No available source",
	);
});
it("parallel real receipts retain all source refs rather than last-writer-wins", async () => {
	const a = await localPaper("a", "ABCDEFGH"),
		b = await localPaper("b", "BCDEFGHJ");
	vi.stubGlobal("fetch", async (url) => ({
		ok: true,
		json: async () =>
			url.endsWith("/children")
				? []
				: { data: { DOI: url.includes("ABCDEFGH") ? "10.1038/a" : "10.1038/b" } },
	}));
	await Promise.all([noteRead(a), noteRead(b), identity(a), identity(b)]);
	const done = await completeResearchGate({
		cwd,
		runDir,
		claimBindings: [binding(a, "claim a"), binding(b, "claim b")],
	});
	expect(done.evidence_gate.reuse_count).toBe(2);
	expect(done.evidence_gate.source_refs).toEqual(expect.arrayContaining([a.path, b.path]));
});
it("live API failure after successful identity verification invalidates reuse", async () => {
	const p = await localPaper();
	await noteRead(p);
	await identity(p);
	vi.stubGlobal("fetch", async () => {
		throw new Error("offline");
	});
	await expect(completeResearchGate({ cwd, runDir, claimRefs: ["claim"] })).rejects.toThrow("changed");
});

it("a missing run does not throw into the tool pipeline", async () => {
	await expect(
		observeResearchReceipt({
			cwd,
			runDir: join(cwd, "results", "loop-fixture", "run-missing"),
			toolName: "research_search_knowledge",
			args: { query: "x" },
			details: { complete: true },
		}),
	).resolves.toBeNull();
});

function journal() {
	const j = createResearchReceiptJournal(cwd);
	journals.push(j);
	return j;
}
function readEvent(p, id = "read") {
	return {
		toolCallId: id,
		toolName: "research_read_knowledge",
		args: { path: p.path },
		details: { path: p.path, text: p.text, hash: p.hash, startLine: 1, endLine: 4 },
	};
}
function verifyEvent(p, id = "verify") {
	return { toolCallId: id, toolName: "research_verify_literature", args: {}, details: p.proof };
}
async function attachJournal(j) {
	return j.execute(runDir, () => updateResearchLoop({ cwd, runDir, action: "status" }));
}
async function finishJournal(j, p) {
	return j.execute(runDir, () => completeResearchGate({ cwd, runDir, claimBindings: [binding(p)] }));
}
it.each(["read-before-start", "verify-before-read", "start-before-read", "parallel"])(
	"journal supports legitimate order %s without rereading",
	async (order) => {
		const p = await localPaper(),
			j = journal();
		if (order === "start-before-read") await attachJournal(j);
		if (order === "verify-before-read") {
			await j.record(verifyEvent(p));
			await j.record(readEvent(p));
		} else if (order === "parallel")
			await Promise.all([j.record(readEvent(p)), j.record(verifyEvent(p)), attachJournal(j)]);
		else {
			await j.record(readEvent(p));
			await j.record(verifyEvent(p));
		}
		await attachJournal(j);
		const done = await finishJournal(j, p);
		expect(done.evidence_gate).toMatchObject({ answerable: true, archive_count: 0, reuse_count: 1 });
		expect(done.receipt_journal.buffered).toBe(2);
		expect(done.evidence_gate.reused_sources[0].evidence_profile).toMatchObject({
			identity: "both-verified",
			reading: { kind: "literature-note", scope: "current-turn" },
			claimSupport: "not-assessed",
		});
	},
);
it("journal rejects cross-session run ownership without erasing the first session's proof", async () => {
	const p = await localPaper(),
		a = journal(),
		b = journal();
	await a.record(readEvent(p));
	await a.record(verifyEvent(p));
	await attachJournal(a);
	await expect(attachJournal(b)).rejects.toThrow("another active session");
	expect((await finishJournal(a, p)).evidence_gate.answerable).toBe(true);
});
it("new turn cannot use old or late completed receipts", async () => {
	const p = await localPaper(),
		old = journal();
	await old.record(readEvent(p));
	await old.record(verifyEvent(p));
	await attachJournal(old);
	await old.close();
	await old.record(readEvent(p, "late"));
	const next = journal();
	await attachJournal(next);
	await expect(finishJournal(next, p)).rejects.toThrow("receipt is missing");
});
it("binding changes between buffered reading and run creation invalidate the receipt", async () => {
	const p = await localPaper(),
		j = journal();
	await j.record(readEvent(p));
	const other = join(cwd, "OtherVault");
	await mkdir(join(other, "Library/Papers"), { recursive: true });
	await writeFile(join(other, p.path), p.text);
	await saveWorkspaceConfig(cwd, { obsidianVault: other });
	const proof = await verifyLiteratureReceipt({
		doi: p.proof.doi,
		zotero_key: p.proof.zoteroKey,
		note_path: p.path,
		vault: other,
	});
	await j.record(verifyEvent({ ...p, proof }));
	await attachJournal(j);
	await expect(finishJournal(j, p)).rejects.toThrow("No available source");
});
it("failed receipts and repeat completion events do not inflate the journal", async () => {
	const p = await localPaper(),
		j = journal();
	await j.record({ ...readEvent(p, "failed"), isError: true });
	await Promise.all([j.record(readEvent(p)), j.record(readEvent(p)), j.record(verifyEvent(p))]);
	const done = await finishJournal(j, p);
	expect(done.receipt_journal.buffered).toBe(2);
	expect(done.evidence_gate.reuse_count).toBe(1);
});
it("buffered note changes before attachment are not accepted", async () => {
	const p = await localPaper(),
		j = journal();
	await j.record(readEvent(p));
	await j.record(verifyEvent(p));
	await writeFile(join(p.vault, p.path), `${p.text} changed`);
	await attachJournal(j);
	await expect(finishJournal(j, p)).rejects.toThrow("No available source");
});
it("run-owned archive receipts accept canonical relative paths without crossing runs", async () => {
	await seedArchive();
	const j = journal();
	await attachJournal(j);
	await j.record({
		toolName: "research_archive_source",
		toolCallId: "archive",
		args: { run_dir: relative(cwd, runDir), url: "https://example.test/p" },
		details: { status: "downloaded", path: join(runDir, "sources/papers/paper.pdf") },
	});
	const status = await attachJournal(j);
	expect(status.evidence_gate.archive_count).toBe(1);
	expect(status.evidence_gate.answerable).toBe(false);
});
it("closing an old journal twice cannot erase a newer turn's receipts", async () => {
	const p = await localPaper(),
		old = journal();
	await attachJournal(old);
	await old.close();
	const next = journal();
	await next.record(readEvent(p));
	await next.record(verifyEvent(p));
	await attachJournal(next);
	await old.close();
	expect((await finishJournal(next, p)).evidence_gate.answerable).toBe(true);
});

it("complete persists structured excerpt bindings and labels legacy compatibility", async () => {
	const p = await localPaper();
	await noteRead(p);
	await identity(p);
	const done = await completeResearchGate({
		cwd,
		runDir,
		claimBindings: [
			{
				claim: "Limited finding",
				relationship: "direct",
				organism: "test",
				method: "test",
				limitations: "fixture only",
				sources: [{ path: p.path, start_line: 4, end_line: 4, quote: "Result and limitations." }],
			},
		],
	});
	expect(done.evidence_gate.claim_bindings[0]).toMatchObject({
		provenanceChecked: true,
		scientificallyVerified: false,
	});
	expect(done.evidence_gate.warnings).toEqual([]);
	await expect(
		completeResearchGate({
			cwd,
			runDir,
			claimBindings: [
				{
					claim: "fake",
					relationship: "direct",
					limitations: "none",
					sources: [{ path: p.path, start_line: 4, end_line: 4, quote: "fabricated" }],
				},
			],
		}),
	).rejects.toThrow("quote");
});

it("reconciliation's live verification receipt is accepted without a redundant identity tool call", async () => {
	const p = await localPaper(),
		j = journal();
	await j.record(readEvent(p));
	await j.record({
		toolName: "research_reconcile_literature",
		toolCallId: "reconcile",
		args: { run_dir: runDir },
		details: { receipt: p.proof, status: "both-identities-verified", writesToLibraries: 0 },
	});
	const done = await finishJournal(j, p);
	expect(done.evidence_gate).toMatchObject({ answerable: true, reuse_count: 1, archive_count: 0 });
	expect(done.receipt_journal.buffered).toBe(2);
});

it("resolves a missing project through the host port", async () => {
	const started = await startResearchRun({ cwd, resultSlug: "direct", query: "Direct caller" });
	expect(started.metadata.project).toBe("host-project");
});
it("does not finalize model-declared stages without observed source evidence", async () => {
	await expect(updateResearchLoop({ cwd, runDir, action: "bind_claims", claimBindings: [] })).rejects.toThrow(
		"sources_archived before bind_claims",
	);
	await expect(updateResearchLoop({ cwd, runDir, action: "finalize" })).rejects.toThrow();
	expect((await updateResearchLoop({ cwd, runDir, action: "status" })).evidence_gate.answerable).toBe(false);
});
it("independent host loops cannot consume each other's observed receipts", async () => {
	const paper = await localPaper();
	await noteRead(paper);
	await identity(paper);
	const another = createResearchLoop({
		workspace,
		resolveProject: async () => "host-project",
		verifyLiteratureReceipt,
		sourceStatus: (input) =>
			sourceStatus(input, {
				workspace,
				publishSourceNote: async () => ({}),
				exclusive: (_key, work) => work(),
			}),
	});
	await expect(
		another.completeResearchGate({ cwd, runDir, claimBindings: [binding(paper)] }),
	).rejects.toThrow();
	expect(
		(await completeResearchGate({ cwd, runDir, claimBindings: [binding(paper)] })).evidence_gate.answerable,
	).toBe(true);
	another.dispose();
});
