import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { ClaimReadRecord, ClaimSourceRecord } from "./claim-bindings.js";
import type { LiteratureReceipt } from "./literature-receipt.js";
import type { PreparedResearchDelivery } from "./research-delivery.js";
import type { ResearchLoopPorts, ResearchLoopWorkspace } from "./research-loop.js";
import { fileHash, type ResearchGate, type ReusedSource, recordOf, within } from "./research-loop-state.js";

type Read = ClaimReadRecord & { receiptId: string; vault?: string | null; revision?: number };
type Identity = Pick<LiteratureReceipt, "doi" | "zoteroKey"> & { hash: string; vault: string };
type Ledger = { reads: Map<string, Read[]>; verified: Map<string, Identity>; readCount: number };
export type RunSources = {
	cwd: string;
	path: string;
	config: ResearchLoopWorkspace;
	ports: Pick<ResearchLoopPorts, "sourceStatus" | "verifyLiteratureReceipt">;
	ledger: Ledger;
};
type ArchiveItem = {
	status?: string;
	id?: string;
	path?: string;
	sha256?: string;
	doi?: string;
	zotero_key?: string;
	metadata?: { doi?: string; zotero_key?: string };
};
type ArchiveStatus = {
	manifest?: { items?: ArchiveItem[] };
	verification?: { ok?: boolean; items?: { ok?: boolean; reason?: string; path?: string }[] };
};

export function ledgerFor(ledgers: Map<string, Ledger>, key: string): Ledger {
	const current = ledgers.get(key);
	if (current) return current;
	const first = ledgers.keys().next();
	if (ledgers.size >= 128 && !first.done) ledgers.delete(first.value);
	const ledger: Ledger = { reads: new Map(), verified: new Map(), readCount: 0 };
	ledgers.set(key, ledger);
	return ledger;
}

export async function reusableSources(run: RunSources): Promise<ReusedSource[]> {
	const { config, ledger } = run;
	if (!config.obsidianVault || !ledger.verified.size) return [];
	const root = await realpath(config.obsidianVault);
	const result: ReusedSource[] = [];
	for (const [path, proof] of ledger.verified) {
		const reads = ledger.reads.get(path) || [];
		const read = reads.at(-1);
		if (
			!read ||
			read.hash !== proof.hash ||
			read.vault !== root ||
			proof.vault !== root ||
			read.revision !== (config.knowledgeBindingRevision || 0)
		)
			continue;
		const current = await run.ports.verifyLiteratureReceipt({
			doi: proof.doi,
			zotero_key: proof.zoteroKey,
			note_path: path,
			vault: root,
		});
		if (
			current.status !== "both-verified" ||
			current.obsidian.hash !== read.hash ||
			current.obsidian.vault !== root
		)
			continue;
		const { startLine, endLine } = read;
		const acquisition = current.zotero.fulltextStatus;
		result.push({
			path,
			hash: read.hash,
			doi: current.doi,
			zotero_key: current.zoteroKey,
			startLine,
			endLine,
			basis: "current-turn-literature-note-read-and-identity-check",
			fulltext_status: acquisition,
			originalFulltextReadThisTurn: false,
			evidence_profile: {
				identity: "both-verified",
				acquisition,
				reading: { kind: "literature-note", scope: "current-turn", startLine, endLine },
				read_receipts: reads.map(({ receiptId, startLine, endLine }) => ({
					id: receiptId,
					startLine,
					endLine,
				})),
				claimSupport: "not-assessed",
			},
		});
	}
	return result;
}

export async function archives(run: RunSources, verify = false) {
	return (await run.ports.sourceStatus({
		cwd: run.cwd,
		run_dir: run.path,
		...(verify && { verify }),
	})) as ArchiveStatus;
}

function aliases(run: RunSources, path: string, absolute: string) {
	return new Set([path, absolute, relative(run.cwd, absolute), relative(run.path, absolute)]);
}

async function verifiedArchivePath(run: RunSources, absolute: string) {
	const root = join(run.path, "sources");
	if (!within(root, absolute)) return null;
	try {
		const canonicalRoot = await realpath(root);
		const canonical = await realpath(absolute);
		return canonicalRoot === join(await realpath(run.path), "sources") && within(canonicalRoot, canonical)
			? canonical
			: null;
	} catch (error) {
		if (recordOf(error).code === "ENOENT") return null;
		throw error;
	}
}

export async function archivedSourceRecords(run: RunSources): Promise<ClaimSourceRecord[]> {
	const records: ClaimSourceRecord[] = [];
	for (const item of (await archives(run)).manifest?.items || []) {
		if (item.status !== "downloaded" || !item.path || !item.sha256) continue;
		const absolute = resolve(run.cwd, item.path);
		const canonical = await verifiedArchivePath(run, absolute);
		if (!canonical || fileHash(await readFile(canonical)) !== item.sha256) continue;
		for (const path of aliases(run, item.path, absolute))
			records.push({
				path,
				hash: item.sha256,
				doi: item.metadata?.doi || item.doi,
				zotero_key: item.metadata?.zotero_key || item.zotero_key,
			});
	}
	return records;
}

function rememberRead(run: RunSources, paths: Iterable<string>, read: Omit<Read, "receiptId">) {
	const { reads } = run.ledger;
	const keys = [...paths];
	const previous = keys.map((key) => reads.get(key)).find(Boolean) || [];
	const current = previous.filter(
		(item) => item.hash === read.hash && item.vault === read.vault && item.revision === read.revision,
	);
	const receipts = [...current, { ...read, receiptId: randomUUID() }].slice(-16);
	for (const key of keys) reads.set(key, receipts);
	run.ledger.readCount += 1;
}

export async function archivedRead(
	run: RunSources,
	path: string,
	args: Record<string, unknown>,
	details: Record<string, unknown>,
	content: unknown,
) {
	const absolute = resolve(run.cwd, path);
	const canonical = await verifiedArchivePath(run, absolute);
	if (!canonical) return false;
	const truncation = recordOf(details.truncation);
	if (truncation.firstLineExceedsLimit) return false;
	const textPart = Array.isArray(content)
		? content.find((part: unknown) => recordOf(part).type === "text")
		: undefined;
	const returned = truncation.content ?? recordOf(textPart).text;
	if (typeof returned !== "string" || !returned.trim()) return false;
	const bytes = await readFile(canonical);
	const sourceText = bytes.toString("utf8");
	if (sourceText.includes("\0") || sourceText.startsWith("%PDF-")) return false;
	const startLine =
		typeof args.offset === "number" && Number.isInteger(args.offset) && args.offset > 0 ? args.offset : 1;
	const selected = sourceText
		.split("\n")
		.slice(
			startLine - 1,
			typeof args.limit === "number" && args.limit ? startLine - 1 + args.limit : undefined,
		);
	const readable: string[] = [];
	let length = 0;
	for (const [index, line] of returned.split("\n", 2000).entries()) {
		if (selected[index] !== line || length + line.length > 90_000) break;
		readable.push(line);
		length += line.length + 1;
	}
	const text = readable.join("\n");
	if (!text.trim()) return false;
	rememberRead(run, aliases(run, path, absolute), {
		hash: fileHash(bytes),
		text,
		startLine,
		endLine: startLine + readable.length - 1,
	});
	return true;
}

export function validateReusedSourceSet(gate: ResearchGate, fresh: readonly ReusedSource[]) {
	if (!gate.reuse_count) return;
	if (
		gate.reused_sources.length !== gate.reuse_count ||
		gate.reused_sources.some(
			(old) =>
				!fresh.some(
					(current) =>
						current.path === old.path &&
						current.hash === old.hash &&
						current.doi === old.doi &&
						current.zotero_key === old.zotero_key,
				),
		)
	)
		throw new Error(
			"Reused source changed or current-turn receipt is missing; re-read and verify the existing note, do not re-import it",
		);
}

export async function observeNote(
	run: RunSources,
	path: string,
	details: Record<string, unknown>,
	binding: unknown,
) {
	const { hash, text, startLine, endLine } = details;
	const { obsidianVault, knowledgeBindingRevision } = run.config;
	if (
		!obsidianVault ||
		!/^Library\/Papers\/.+\.md$/.test(path) ||
		typeof hash !== "string" ||
		!/^[a-f0-9]{64}$/i.test(hash) ||
		typeof text !== "string" ||
		!text.trim() ||
		typeof startLine !== "number" ||
		!Number.isInteger(startLine) ||
		typeof endLine !== "number" ||
		endLine < startLine
	)
		return;
	const proof = recordOf(binding);
	const vault = binding
		? typeof proof.vault === "string"
			? proof.vault
			: null
		: await realpath(obsidianVault);
	const revision = binding
		? typeof proof.revision === "number"
			? proof.revision
			: -1
		: knowledgeBindingRevision || 0;
	rememberRead(run, [path], { hash, text, vault, revision, startLine, endLine });
}

export function rememberIdentity(run: RunSources, details: Record<string, unknown>) {
	const obsidian = recordOf(details.obsidian);
	const zotero = recordOf(details.zotero);
	const { path, hash, vault } = obsidian;
	const { doi, zoteroKey } = details;
	if (
		details.status !== "both-verified" ||
		obsidian.status !== "verified" ||
		zotero.status !== "verified" ||
		typeof path !== "string" ||
		!/^Library\/Papers\/.+\.md$/.test(path) ||
		typeof hash !== "string" ||
		typeof vault !== "string" ||
		typeof doi !== "string" ||
		typeof zoteroKey !== "string"
	)
		return false;
	run.ledger.verified.set(path, { doi, zoteroKey, hash, vault });
	return true;
}

export function deliveryReads(run: RunSources, claims: PreparedResearchDelivery["claims"]) {
	const found = new Map<string, PreparedResearchDelivery["readReceipts"][number]>();
	for (const claim of claims)
		for (const source of claim.sources) {
			const read = run.ledger.reads
				.get(source.path)
				?.find((item) => item.receiptId === source.read_receipt_id);
			if (!read) throw new Error("Current read receipt for summary delivery is missing");
			found.set(JSON.stringify([source.path, read.receiptId]), {
				receiptId: read.receiptId,
				path: source.path,
				sha256: read.hash,
				startLine: read.startLine,
				endLine: read.endLine,
				text: read.text,
			});
		}
	return [...found.values()];
}
