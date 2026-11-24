import { randomUUID } from "node:crypto";
import type { KnowledgeBinding } from "./config.js";
import { type ReadNoteResult, validateNote } from "./files.js";
import * as policy from "./wiki-policy.js";

interface DraftSource {
	path: string;
	startLine: number;
	endLine: number;
	hash: string;
}

export function validateWikiSourcePaths(paths: unknown): void {
	policy.checkSources(paths, (entries, index) => {
		try {
			validateNote(entries[index]);
			return true;
		} catch {
			return false;
		}
	});
}

export function readWikiDraft(input: Record<string, unknown>, sources: DraftSource[], path: string) {
	if (sources.some((source) => source.path === path || /[[\]#|\r\n]/.test(source.path)))
		throw new Error("A Wiki cannot cite itself or an ambiguous link path");
	if (
		sources.every(
			(source) =>
				/(?:^|\/)Wiki\//.test(source.path) || /(?:^|\/)(?:Home|Index|Context)\.md$/.test(source.path),
		)
	)
		throw new Error("Read at least one underlying evidence/source note, not only Wiki or navigation");
	const { title, markdown, rationale } = input;
	if (typeof title !== "string" || !title.trim() || title.length > 200 || /[\r\n]/.test(title))
		throw new Error("A single-line Wiki title is required");
	if (!isDraftMarkdown(markdown, 24000))
		throw new Error("Wiki candidate must contain 1–24000 characters and no managed markers");
	if (typeof rationale !== "string" || !rationale.trim() || rationale.length > 1000)
		throw new Error("A concise change rationale is required");
	return { title, markdown, rationale };
}

function isDraftMarkdown(markdown: unknown, maxLength: number): markdown is string {
	return (
		typeof markdown === "string" &&
		!!markdown.trim() &&
		markdown.length <= maxLength &&
		!markdown.includes("<!-- pi-agent:managed:")
	);
}

function proposedText(original: string | null, title: string, body: string, refs: string): string {
	return policy.withManagedWikiBlock(original, title, `${body}\n\n## Sources\n${refs}`.trim());
}

function sourceReferences(sources: DraftSource[]): string {
	return sources
		.map(
			(source) =>
				`- [[${source.path.slice(0, -3)}]] · lines ${source.startLine}–${source.endLine} · sha256 ${source.hash}`,
		)
		.join("\n");
}

function sealWikiDraft<Proposal extends policy.WikiProposalShape & { after: string }>(proposal: Proposal) {
	return {
		...proposal,
		afterHash: policy.wikiContentHash(proposal.after),
		proposalHash: policy.immutableWikiProposalHash(proposal),
	};
}

export function buildWikiDraft(
	binding: KnowledgeBinding,
	project: string,
	path: string,
	{ title, markdown, rationale }: ReturnType<typeof readWikiDraft>,
	original: ReadNoteResult | null,
	sources: DraftSource[],
) {
	if (original && original.bytes > 64 * 1024)
		throw new Error("Existing Wiki exceeds the bounded review size; split it before editing");
	if (original && policy.managedParts(original.text).body.length > 24000)
		throw new Error("Existing generated block exceeds the review size");
	const refs = sourceReferences(sources);
	const after = proposedText(original?.text ?? null, title.trim(), policy.stripManagedHeader(markdown), refs);
	return sealWikiDraft({
		id: randomUUID(),
		status: "pending",
		vaultId: binding.vaultId,
		bindingRevision: binding.revision,
		project,
		path,
		title: title.trim(),
		rationale: rationale.trim(),
		createdAt: Date.now(),
		sources,
		before: original?.text ?? null,
		beforeHash: original?.hash ?? null,
		after,
	});
}

export function mergeWikiDraft(
	proposal: ReturnType<typeof buildWikiDraft>,
	newSources: DraftSource[],
	markdown: unknown,
	rationale: unknown,
) {
	const byPath = new Map(proposal.sources.map((source) => [source.path, source]));
	for (const source of newSources) byPath.set(source.path, source);
	const sources = [...byPath.values()];
	if (sources.length > 12)
		throw new Error(
			"Pending topic reached the 12-source review budget; review it before adding another round",
		);
	if (!isDraftMarkdown(markdown, 12000))
		throw new Error("Incremental topic summary must contain 1–12000 characters and no managed markers");
	if (typeof rationale !== "string" || !rationale.trim() || rationale.length > 1000)
		throw new Error("A concise merge rationale is required");
	const prior = policy
		.managedParts(proposal.after)
		.body.replace(/\n\n## Sources\n[\s\S]*$/, "")
		.trim();
	const update = `## Research update · ${new Date().toISOString()}\n\n${policy.stripManagedHeader(markdown)}`;
	const merged = [prior, update].filter(Boolean).join("\n\n");
	if (merged.length > 22000)
		throw new Error("Pending topic synthesis is too large; review it before adding another round");
	const refs = sourceReferences(sources);
	const after = proposedText(proposal.before, proposal.title, merged, refs);
	return sealWikiDraft({
		...proposal,
		createdAt: Date.now(),
		rationale: `${proposal.rationale}\n\nAccumulated research round: ${rationale.trim()}`.slice(0, 1000),
		sources,
		after,
	});
}
