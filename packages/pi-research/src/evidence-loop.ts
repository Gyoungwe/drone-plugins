import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { access, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import {
	type EvidenceLoopFailureCode,
	evidenceLoopFailureCandidate,
	type FailureCandidateSink,
	recordFailureCandidate,
} from "./core/failure-candidates.js";
import { createEvidenceGate } from "./evidence-gate.js";
import {
	citationUri,
	normalize,
	pageRange,
	parseFrontmatter,
	safeSegment,
	selectReadLines,
	sourceId,
	termsFor,
	titleOf,
} from "./evidence-loop-parse.js";
import type { Context, Tool } from "./research-loop-tool.js";

export { citationUri, pageRange } from "./evidence-loop-parse.js";

// pdf.js disables worker threads in Node. Register its bundled handler so the
// published extension can read PDFs without relying on a host checkout's worker file.
(globalThis as { pdfjsWorker?: { WorkerMessageHandler: typeof WorkerMessageHandler } }).pdfjsWorker = {
	WorkerMessageHandler,
};

const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const MAX_RESULTS = 12;
const MAX_READ_CHARS = 12_000;
const SOURCE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".pdf"]);

type SourceRecord = {
	id: string;
	root: string;
	path: string;
	relativePath: string;
	title: string;
	uri: string;
	doi: string | null;
	text: string;
	hash: string;
};

type ReadRange = {
	receiptId: string;
	readText: string;
	startLine: number;
	endLine: number;
	pageStart?: number;
	pageEnd?: number;
	readAt: string;
};
type ReadReceipt = SourceRecord & ReadRange & { ranges: readonly ReadRange[] };

type ResearchState = {
	index: Map<string, SourceRecord>;
	reads: Map<string, ReadReceipt>;
	searches: number;
	deposits: number;
};
type Pi = { registerTool(tool: Omit<Tool, "executionMode">): void };
type StateFor = (ctx: Context) => ResearchState;
type ReportFailure = (code: EvidenceLoopFailureCode, receiptId: string) => Promise<void>;

export interface EvidenceLoopOptions {
	failureCandidateSink?: FailureCandidateSink;
}

async function currentReads(
	state: ResearchState,
	ids: readonly string[],
	reportChange: () => Promise<void>,
): Promise<ReadReceipt[]> {
	const result: ReadReceipt[] = [];
	for (const id of ids) {
		const receipt = state.reads.get(id);
		if (!receipt) throw new Error("Every source_id must have an observed read receipt");
		const current = await readSource(receipt.root, receipt.path);
		if (!current || current.hash !== receipt.hash) {
			state.reads.delete(id);
			await reportChange();
			throw new Error("Source changed since reading; search and read its current version");
		}
		result.push(receipt);
	}
	return result;
}

function result(details: unknown) {
	return {
		content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
		details,
	};
}

function sessionKey(ctx: Context): string {
	return String(ctx?.sessionManager?.getSessionId?.() || ctx?.sessionId || ctx?.cwd || "default");
}

function contained(root: string, target: string): boolean {
	const rel = relative(resolve(root), resolve(target));
	return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.includes(sep + sep));
}

async function readPdfText(path: string): Promise<string> {
	const data = new Uint8Array(await readFile(path));
	const document = await getDocument({
		data,
		useWorkerFetch: false,
		disableFontFace: true,
		verbosity: 0,
	}).promise;
	const pages: string[] = [];
	try {
		for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
			const page = await document.getPage(pageNumber);
			const content = await page.getTextContent();
			const text = content.items
				.map((item) => ("str" in item ? item.str : ""))
				.join(" ")
				.replace(/\s+/gu, " ")
				.trim();
			pages.push(`[[page:${pageNumber}]]${text ? `\n${text}` : ""}`);
			page.cleanup();
		}
	} finally {
		await document.cleanup();
	}
	return pages.join("\n\n");
}

async function walk(root: string, out: string[] = []): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return out;
		throw error;
	}
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith(".")) continue;
		const path = join(root, entry.name);
		if (entry.isDirectory()) await walk(path, out);
		else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) out.push(path);
		if (out.length >= MAX_RESULTS * 4) break;
	}
	return out;
}

async function readSource(root: string, path: string): Promise<SourceRecord | null> {
	const info = await stat(path);
	const isPdf = extname(path).toLowerCase() === ".pdf";
	const maxBytes = isPdf ? MAX_PDF_BYTES : MAX_SOURCE_BYTES;
	if (!info.isFile() || info.size > maxBytes) return null;
	const text = isPdf ? await readPdfText(path) : await readFile(path, "utf8");
	const { fields, body } = parseFrontmatter(text);
	const relativePath = relative(root, path).split(sep).join("/");
	const id = sourceId(relativePath, fields, text);
	return {
		id,
		root,
		path,
		relativePath,
		title: titleOf(path, fields, body),
		uri:
			fields.uri ||
			fields.url ||
			(fields.doi ? `https://doi.org/${fields.doi}` : isPdf ? relativePath : `source://${id}`),
		doi: fields.doi || null,
		text,
		hash: createHash("sha256").update(text).digest("hex"),
	};
}

async function sourceRoot(ctx: Context, sourceDir?: unknown): Promise<string> {
	const cwd = resolve(String(ctx?.cwd || process.cwd()));
	const candidate = resolve(
		cwd,
		String(sourceDir || process.env.DRONE_RESEARCH_SOURCE_DIR || "research-sources"),
	);
	if (!contained(cwd, candidate)) throw new Error("source_dir must stay inside the current workspace");
	await access(candidate).catch((error: unknown) => {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT")
			throw new Error(`source_dir does not exist: ${relative(cwd, candidate)}`);
		throw error;
	});
	return candidate;
}

function publicSource(source: SourceRecord) {
	return {
		source_id: source.id,
		title: source.title,
		uri: source.uri,
		doi: source.doi,
		path: source.relativePath,
		hash: source.hash,
	};
}

async function indexSources(
	ctx: Context,
	sourceDir: unknown,
	query: string,
	limit: number,
): Promise<SourceRecord[]> {
	const root = await sourceRoot(ctx, sourceDir);
	const words = termsFor(query);
	const records: Array<SourceRecord & { _score: number }> = [];

	for (const path of await walk(root)) {
		const source = await readSource(root, path);
		if (!source) continue;
		const haystack = normalize(`${source.title}\n${source.text}`);
		const score = words.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
		if (!words.length || score > 0) records.push({ ...source, _score: score });
	}
	return records
		.sort((a, b) => b._score - a._score || a.relativePath.localeCompare(b.relativePath))
		.slice(0, limit);
}

function registerSearchTool(pi: Pi, stateFor: StateFor, report: ReportFailure) {
	pi.registerTool({
		name: "research_search_sources",
		label: "Research · search sources",
		description:
			"Search a bounded local source directory and return traceable source identities. Search results are discovery only; read the selected sources before answering.",
		drone: { readOnly: true, recoverySafe: true, capabilities: ["research"] },
		parameters: {
			type: "object",
			properties: {
				query: { type: "string", minLength: 1 },
				source_dir: {
					type: "string",
					description: "Workspace-relative directory of Markdown/text source records.",
				},
				limit: { type: "integer", minimum: 1, maximum: MAX_RESULTS },
			},
			required: ["query"],
		},
		async execute(id, params, _signal, _update, ctx) {
			const query = String(params?.query || "").trim();
			if (!query) throw new Error("query is required");
			const limit = Math.max(1, Math.min(MAX_RESULTS, Number(params?.limit) || 6));
			const state = stateFor(ctx);
			const hits = await indexSources(ctx, params?.source_dir, query, limit);
			state.index.clear();
			for (const source of hits) state.index.set(source.id, source);
			state.searches += 1;
			if (hits.length === 0) await report("zero-local-hits", id);
			return result({
				query,
				search_id: `search-${state.searches}`,
				hits: hits.map(publicSource),
				count: hits.length,
				read_required: true,
				remote_fallback: {
					status: "not-configured",
					message:
						"This package does not invent remote results; add an authorized connector at the host layer.",
				},
			});
		},
	});
}

function readSourceResult(current: SourceRecord, state: ResearchState, range: ReadRange) {
	const previous = state.reads.get(current.id);
	const sameSource = previous?.hash === current.hash;
	const ranges = [...(sameSource ? previous.ranges : []), range].slice(-16);
	state.reads.set(current.id, { ...current, ...range, ranges });
	return result({
		...publicSource(current),
		content: range.readText,
		status: sameSource ? "already-read" : "read",
		read_receipts: ranges.map((item) => ({
			receipt_id: item.receiptId,
			start_line: item.startLine,
			end_line: item.endLine,
		})),
		read_receipt: {
			source_id: current.id,
			hash: current.hash,
			receipt_id: range.receiptId,
			start_line: range.startLine,
			end_line: range.endLine,
			...(range.pageStart ? { page_start: range.pageStart, page_end: range.pageEnd } : {}),
		},
	});
}

function registerReadTool(pi: Pi, stateFor: StateFor, report: ReportFailure) {
	pi.registerTool({
		name: "research_read_source",
		label: "Research · read source",
		description:
			"Read a bounded source returned by research_search_sources and record its hash, excerpt and citation receipt for this session. PDF-derived text may include [[page:N]] markers; only pages present in this receipt may be cited with #page=N.",
		drone: { readOnly: true, recoverySafe: true, capabilities: ["research"] },
		parameters: {
			type: "object",
			properties: {
				source_id: { type: "string" },
				start_line: { type: "integer", minimum: 1 },
				max_chars: { type: "integer", minimum: 200, maximum: MAX_READ_CHARS },
			},
			required: ["source_id"],
		},
		async execute(id, params, _signal, _update, ctx) {
			const state = stateFor(ctx);
			const source = state.index.get(String(params?.source_id || ""));
			if (!source) throw new Error("source_id must come from the latest research_search_sources result");
			const current = await readSource(source.root, source.path).catch(() => null);
			if (!current || current.hash !== source.hash) {
				await report("source-changed-mid-read", id);
				throw new Error("source changed after search; search again before reading");
			}
			const maxChars = Math.max(200, Math.min(MAX_READ_CHARS, Number(params?.max_chars) || 8000));
			const body = parseFrontmatter(current.text).body;
			const lines = selectReadLines(body, params?.start_line ?? 1, maxChars);
			const pages = pageRange(lines.readText);
			return readSourceResult(current, state, {
				receiptId: randomUUID(),
				...lines,
				...(pages ? { pageStart: pages.start, pageEnd: pages.end } : {}),
				readAt: new Date().toISOString(),
			});
		},
	});
}

function registerDepositTool(pi: Pi, stateFor: StateFor, report: ReportFailure) {
	pi.registerTool({
		name: "research_deposit_research_note",
		label: "Research · deposit sourced note",
		description:
			"Write a bounded, source-linked research note under the workspace. This records a candidate synthesis and never claims scientific verification.",
		drone: { capabilities: ["research"] },
		parameters: {
			type: "object",
			properties: {
				title: { type: "string", minLength: 1 },
				markdown: { type: "string", minLength: 1, maxLength: 30_000 },
				source_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: MAX_RESULTS },
				slug: { type: "string" },
			},
			required: ["title", "markdown", "source_ids"],
		},
		async execute(id, params, _signal, _update, ctx) {
			const state = stateFor(ctx);
			const ids = Array.from(
				new Set<string>((Array.isArray(params?.source_ids) ? params.source_ids : []).map(String)),
			);
			if (!ids.length) throw new Error("source_ids must contain at least one source read this session");
			const sources = await currentReads(state, ids, () => report("source-changed-mid-read", id));
			if (sources.length !== ids.length) throw new Error("every source_id must have a current read receipt");
			const cwd = resolve(String(ctx?.cwd || process.cwd()));
			const notesRoot = join(cwd, ".pi", "research-notes");
			const slug = safeSegment(params?.slug || String(params.title).slice(0, 48).replace(/\s+/g, "-"));
			const path = join(notesRoot, `${slug}.md`);
			if (!contained(cwd, path)) throw new Error("note path escapes workspace");
			const citationLines = sources.map(
				(source) => `- [${source.title}](${source.uri}) (sha256: ${source.hash})`,
			);
			const note = `# ${String(params.title).trim()}\n\n${String(params.markdown).trim()}\n\n## Sources\n${citationLines.join("\n")}\n\n> Candidate synthesis only; scientific verification remains false.\n`;
			await mkdir(dirname(path), { recursive: true });
			const temporary = `${path}.${process.pid}.tmp`;
			await writeFile(temporary, note, "utf8");
			await rename(temporary, path);
			state.deposits += 1;
			return result({
				path: relative(cwd, path).split(sep).join("/"),
				status: "written",
				source_ids: ids,
				scientificallyVerified: false,
			});
		},
	});
}

function registerAnswerTool(pi: Pi, stateFor: StateFor, report: ReportFailure) {
	pi.registerTool({
		name: "research_answer_sources",
		label: "Research · answer with sources",
		description:
			"Return a deterministic evidence packet only after at least two distinct sources were read this session. The host/model must still assess entailment and limitations.",
		drone: { readOnly: true, recoverySafe: true, capabilities: ["research"] },
		parameters: {
			type: "object",
			properties: {
				question: { type: "string", minLength: 1 },
				source_ids: { type: "array", items: { type: "string" }, minItems: 2, maxItems: MAX_RESULTS },
			},
			required: ["question"],
		},
		async execute(id, params, _signal, _update, ctx) {
			const state = stateFor(ctx);
			const ids = (Array.isArray(params?.source_ids) ? params.source_ids : [...state.reads.keys()]).map(
				String,
			);
			const reads = await currentReads(state, [...new Set<string>(ids)], () =>
				report("source-changed-mid-read", id),
			);
			if (reads.length < 2) {
				await report("insufficient-distinct-sources", id);
				throw new Error("answer requires at least two distinct read sources");
			}
			return answerFromReads(String(params?.question).trim(), reads);
		},
	});
}

function answerFromReads(question: string, reads: readonly ReadReceipt[]) {
	const gate = createEvidenceGate({ scope: "research-source-answer" });
	gate.advance("local_query_recorded", { question });
	gate.advance("sources_inspected", { source_count: reads.length });
	gate.advance("sources_archived", { source_count: reads.length, archive: "session-receipts" });
	gate.advance("claims_bound", { source_ids: reads.map((read) => read.id) });
	gate.advance("answerable", { source_count: reads.length });
	return result({
		question,
		answer: reads
			.map((read) => `${read.title}: ${read.readText.replace(/\s+/g, " ").slice(0, 640)}`)
			.join("\n\n"),
		citations: reads.map((read) => ({
			...publicSource(read),
			uri: citationUri(
				read.uri,
				read.pageStart ? { start: read.pageStart, end: read.pageEnd ?? read.pageStart } : undefined,
			),
			read_hash: read.hash,
			lines: [read.startLine, read.endLine],
			read_receipts: read.ranges.map((item) => ({
				receipt_id: item.receiptId,
				start_line: item.startLine,
				end_line: item.endLine,
				content: item.readText,
			})),
			...(read.pageStart ? { pages: [read.pageStart, read.pageEnd ?? read.pageStart] } : {}),
		})),
		source_count: reads.length,
		evidence_gate: gate.snapshot(),
		limitations: [
			"This is a source packet, not an independent scientific verification or causal conclusion.",
		],
	});
}

export function registerEvidenceLoop(pi: Pi, { failureCandidateSink }: EvidenceLoopOptions = {}): void {
	if (process.env.PI_SUBAGENT_CHILD === "1") return;
	const stateBySession = new Map<string, ResearchState>();
	const stateFor = (ctx: Context): ResearchState => {
		const key = sessionKey(ctx);
		const existing = stateBySession.get(key);
		if (existing) return existing;
		const state: ResearchState = { index: new Map(), reads: new Map(), searches: 0, deposits: 0 };
		stateBySession.set(key, state);
		return state;
	};
	const report: ReportFailure = async (code, receiptId) => {
		if (failureCandidateSink)
			await recordFailureCandidate(failureCandidateSink, evidenceLoopFailureCandidate(code, receiptId));
	};
	registerSearchTool(pi, stateFor, report);
	registerReadTool(pi, stateFor, report);
	registerDepositTool(pi, stateFor, report);
	registerAnswerTool(pi, stateFor, report);
	pi.registerTool({
		name: "research_status",
		label: "Research · evidence status",
		description: "Show bounded research source and evidence receipts for the current native Pi session.",
		drone: { readOnly: true, recoverySafe: true, capabilities: ["research"] },
		parameters: { type: "object", properties: {} },
		async execute(_id, _params, _signal, _update, ctx) {
			const state = stateFor(ctx);
			return result({
				searches: state.searches,
				reads: state.reads.size,
				deposits: state.deposits,
				answerable: state.reads.size >= 2,
			});
		},
	});
}
