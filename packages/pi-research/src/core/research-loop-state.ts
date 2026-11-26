import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { ClaimBinding, ClaimSourceRecord } from "./claim-bindings.js";
import type { LiteratureReceipt } from "./literature-receipt.js";
import type { SlowPathBreakerReceipt, SlowPathState } from "./research-breaker.js";
import type { ResearchDeliveryReceipt } from "./research-delivery.js";
import type { FastPathProgress, ResearchExecutionMode } from "./research-fast-path.js";

export { isWithin as within } from "./source-archive-policy.js";

export const RESEARCH_STAGES = Object.freeze([
	"created",
	"local_query_recorded",
	"external_search_recorded",
	"sources_inspected",
	"sources_archived",
	"sources_reused",
	"claims_bound",
	"answerable",
] as const);
export const RESEARCH_DOCUMENT_KIND = "drone.research.run";

export type ResearchStage = (typeof RESEARCH_STAGES)[number];
type GateEvent = { type: string; at: string; skipped?: boolean } & Record<string, unknown>;

export function stageIndex(stage: ResearchStage) {
	return RESEARCH_STAGES.indexOf(stage);
}

export function requireStage(gate: ResearchGate, stage: ResearchStage, action: string) {
	if (stageIndex(gate.stage) < stageIndex(stage))
		throw new Error(`research loop must reach ${stage} before ${action}`);
}

export interface ReusedSource extends ClaimSourceRecord {
	startLine: number;
	endLine: number;
	basis: "current-turn-literature-note-read-and-identity-check";
	fulltext_status: LiteratureReceipt["zotero"]["fulltextStatus"];
	originalFulltextReadThisTurn: false;
	evidence_profile: {
		identity: "both-verified";
		acquisition: LiteratureReceipt["zotero"]["fulltextStatus"];
		reading: { kind: "literature-note"; scope: "current-turn"; startLine: number; endLine: number };
		read_receipts: { id: string; startLine: number; endLine: number }[];
		claimSupport: "not-assessed";
	};
}

export interface ResearchGate {
	stage: ResearchStage;
	status: "ok" | "failed";
	answerable: boolean;
	events: GateEvent[];
	claim_refs: string[];
	claim_bindings: ClaimBinding[];
	warnings: string[];
	source_refs: string[];
	archive_count: number;
	reuse_count: number;
	reused_sources: ReusedSource[];
	scientificallyVerified: false;
}

export interface ResearchRunMetadata {
	kind: typeof RESEARCH_DOCUMENT_KIND;
	version: 1;
	run_id: string;
	project?: string;
	result_slug?: string;
	topic_id?: string;
	query?: string;
	status?: "running" | "completed" | "stopped_by_breaker";
	mode?: ResearchExecutionMode;
	fast_path?: FastPathProgress;
	slow_path?: SlowPathState;
	breaker_receipt?: SlowPathBreakerReceipt;
	revision?: number;
	requires_provenance?: boolean;
	started_at?: string;
	updated_at?: string;
	finalized_at?: string;
	evidence_gate?: Partial<ResearchGate>;
	research_nodes?: ReturnType<typeof researchNodes>;
	provenance?: ReturnType<typeof provenanceFor>;
	summary_status?: "written";
	summary_updated_at?: string;
	delivery_receipt?: ResearchDeliveryReceipt;
}

export function safeSlug(value: unknown, label: string) {
	const text = String(value ?? "").trim();
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) throw new Error(`${label} must be lowercase kebab-case`);
	return text;
}

export function topicIdFromResultSlug(value: unknown) {
	const slug = safeSlug(value || "research-question", "result_slug");
	return slug.replace(/-20\d{6}(?:\d{6})?$/, "").replace(/-run-\d+$/, "") || slug;
}

export function fileHash(bytes: string | Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

export function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function gateOf(metadata: ResearchRunMetadata): ResearchGate {
	const gate = metadata.evidence_gate;
	const claimRefs = Array.isArray(gate?.claim_refs) ? gate.claim_refs : [];
	const bindings = Array.isArray(gate?.claim_bindings) ? gate.claim_bindings : [];
	return {
		stage: gate?.stage && RESEARCH_STAGES.includes(gate.stage) ? gate.stage : "created",
		status: gate?.status === "failed" ? "failed" : "ok",
		answerable: gate?.answerable === true,
		events: Array.isArray(gate?.events) ? gate.events : [],
		claim_refs: claimRefs,
		claim_bindings: bindings,
		warnings:
			claimRefs.length && !bindings.length ? ["legacy-unstructured-claims: support not assessed"] : [],
		source_refs: Array.isArray(gate?.source_refs) ? gate.source_refs : [],
		archive_count: Number(gate?.archive_count) || 0,
		reuse_count: Number(gate?.reuse_count) || 0,
		reused_sources: Array.isArray(gate?.reused_sources) ? gate.reused_sources : [],
		scientificallyVerified: false,
	};
}

export function researchNodes(gate: Pick<ResearchGate, "stage" | "answerable" | "events">) {
	const current = stageIndex(gate.stage);
	return RESEARCH_STAGES.map((id, index) => ({
		id,
		state: gate.answerable || index < current ? "completed" : index === current ? "current" : "pending",
		observed: gate.events.some((event) => event?.type === id && !event.skipped),
	}));
}

export function provenanceFor(gate: ResearchGate, at: string) {
	return {
		status: gate.answerable ? "host-verified" : "pending",
		source_refs: [...gate.source_refs],
		claim_bindings: structuredClone(gate.claim_bindings),
		updated_at: at,
	};
}

export function advance(gate: ResearchGate, stage: ResearchStage, at: string, details = {}): ResearchGate {
	const repeated = stageIndex(stage) < stageIndex(gate.stage);
	return {
		...gate,
		stage: repeated ? gate.stage : stage,
		events: [...gate.events, { type: stage, at, ...(repeated ? { repeated: true } : {}), ...details }],
	};
}

export async function readResearchMetadata(path: string): Promise<ResearchRunMetadata> {
	if (!(await lstat(path)).isFile()) throw new Error("Expected a regular research metadata file");
	const raw: unknown = JSON.parse(await readFile(path, "utf8"));
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid JSON object: ${path}`);
	const value = raw as ResearchRunMetadata;
	if (!value.kind) return { ...value, kind: RESEARCH_DOCUMENT_KIND, version: 1 };
	if (value.kind !== RESEARCH_DOCUMENT_KIND || value.version !== 1)
		throw new Error(`Unsupported research metadata document: ${path}`);
	return value;
}

export async function writeResearchMetadata(path: string, value: ResearchRunMetadata) {
	const bytes = `${JSON.stringify(value, null, 2)}\n`;
	const temp = `${path}.${randomUUID()}.tmp`;
	try {
		await writeFile(temp, bytes, { flag: "wx" });
		await rename(temp, path);
	} finally {
		await rm(temp, { force: true });
	}
	if ((await readFile(path, "utf8")) !== bytes) throw new Error("Research metadata readback differed");
}

export function revisionOf(metadata: ResearchRunMetadata) {
	return typeof metadata.revision === "number" && Number.isSafeInteger(metadata.revision)
		? metadata.revision
		: 0;
}
