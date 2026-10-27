/**
 * Host-neutral research run read adapter.
 *
 * The adapter owns the run metadata projection and registration contract, while
 * the host owns every filesystem operation.  This keeps the public host entry
 * useful to native and Desktop composition roots without importing Electron,
 * Pi runtime code, Node filesystem APIs or network clients.
 */

export interface ResearchFileEntry {
	readonly name: string;
	readonly kind: "file" | "directory" | "symlink" | "other";
}

export interface ResearchResolvedRoot {
	readonly handle: string;
	readonly path: string;
}

export interface ResearchHostPort {
	resolveRoot(path: string): Promise<{ handle: string }>;
	readText(root: string, path: string): Promise<string>;
	listFiles(root: string, path: string): Promise<readonly ResearchFileEntry[]>;
}

export interface ResearchRunListInput {
	readonly workspace: string;
	readonly project?: string | null;
	readonly limit?: number;
}

export interface ResearchRunStatusInput extends ResearchRunListInput {
	readonly runDir?: string | null;
}

export interface ResearchRunDetailInput extends ResearchRunStatusInput {
	readonly runId?: string | null;
}

export interface ResearchRunSummary {
	readonly runId: string;
	readonly resultSlug: string;
	readonly project: string;
	readonly topicId: string | null;
	readonly query: string;
	readonly status: string;
	readonly stage: string;
	readonly answerable: boolean;
	readonly startedAt: string | null;
	readonly updatedAt: string | null;
	readonly runDir: string;
}

export interface ResearchRunListResult {
	readonly items: readonly ResearchRunSummary[];
	readonly total: number;
}

export interface ResearchRunDetail extends ResearchRunSummary {
	readonly route: readonly { key: string; state: string; at: string | null; detail: string | null }[];
	readonly timeline: readonly {
		type: string;
		at: string | null;
		detail: string | null;
		status: "ok" | "failed" | "observed";
	}[];
	readonly sources: readonly { path: string; status: string; hash: string | null; verified: boolean }[];
	readonly claims: readonly { id: string | null; claim: string; support: string[]; status: string }[];
	readonly warnings: readonly string[];
	readonly coverage: Record<string, unknown> | null;
	readonly archive: { count: number; reused: number; verified: boolean };
}

export interface ResearchHostOperations {
	status(input: ResearchRunStatusInput): Promise<ResearchRunListResult | { item: ResearchRunSummary }>;
	listRuns(input: ResearchRunListInput): Promise<ResearchRunListResult>;
	detail?(input: ResearchRunDetailInput): Promise<ResearchRunDetail>;
}

export interface ResearchHostAdapter {
	readonly contractVersion: 1;
	readonly operations: ResearchHostOperations;
}

export interface ResearchHostRegistry {
	register(
		name: "status" | "listRuns" | "detail",
		operation:
			| ResearchHostOperations["status"]
			| ResearchHostOperations["listRuns"]
			| NonNullable<ResearchHostOperations["detail"]>,
	): void;
}

export interface ResearchHostLoader {
	readonly contractVersion: 1;
	load(port: ResearchHostPort): ResearchHostAdapter;
}

interface ResearchWorkspaceConfig {
	resultsRoot?: unknown;
}

interface RunMetadata {
	run_id?: unknown;
	result_slug?: unknown;
	project?: unknown;
	topic_id?: unknown;
	query?: unknown;
	status?: unknown;
	started_at?: unknown;
	updated_at?: unknown;
	evidence_gate?: unknown;
	retrieval_coverage?: unknown;
}

const STAGES = new Set([
	"created",
	"local_query_recorded",
	"external_search_recorded",
	"sources_inspected",
	"sources_archived",
	"sources_reused",
	"claims_bound",
	"answerable",
]);

function text(value: unknown, max = 1000): string {
	return String(value ?? "").normalize("NFKC").replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
}

function relativePath(value: string, label: string): string {
	const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
	if (!normalized || normalized.startsWith("/") || normalized.split("/").includes(".."))
		throw new Error(`${label} must stay inside the configured workspace`);
	return normalized;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
	return value as Record<string, unknown>;
}

function isErrno(error: unknown, code: string): boolean {
	return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}

function gate(metadata: RunMetadata): { stage: string; answerable: boolean } {
	const value = metadata.evidence_gate;
	if (!value || typeof value !== "object" || Array.isArray(value)) return { stage: "created", answerable: false };
	const candidate = value as Record<string, unknown>;
	const stage = text(candidate.stage, 80);
	return { stage: STAGES.has(stage) ? stage : "created", answerable: candidate.answerable === true };
}

function summary(metadata: RunMetadata, runDir: string, resultsPath: string): ResearchRunSummary {
	const evidence = gate(metadata);
	const normalizedRunDir = runDir.replaceAll("\\", "/");
	const relativeRunDir = resultsPath && normalizedRunDir.startsWith(`${resultsPath}/`)
		? normalizedRunDir.slice(resultsPath.length + 1)
		: normalizedRunDir;
	return {
		runId: text(metadata.run_id || normalizedRunDir.split("/").at(-1), 180),
		resultSlug: text(metadata.result_slug || relativeRunDir.split("/")[0], 180),
		project: text(metadata.project, 180),
		topicId: text(metadata.topic_id, 180) || null,
		query: text(metadata.query),
		status: text(metadata.status, 80) || "unknown",
		stage: evidence.stage,
		answerable: evidence.answerable,
		startedAt: text(metadata.started_at, 80) || null,
		updatedAt: text(metadata.updated_at || metadata.started_at, 80) || null,
		runDir: relativeRunDir,
	};
}

function detail(metadata: RunMetadata, runDir: string, resultsPath: string): ResearchRunDetail {
	const item = summary(metadata, runDir, resultsPath);
	const gateValue = metadata.evidence_gate;
	const gateObject = gateValue && typeof gateValue === "object" && !Array.isArray(gateValue)
		? gateValue as Record<string, unknown>
		: {};
	const events = Array.isArray(gateObject.events) ? gateObject.events : [];
	const stages = [
		"created", "local_query_recorded", "external_search_recorded", "sources_inspected",
		"sources_archived", "sources_reused", "claims_bound", "answerable",
	];
	const current = stages.includes(item.stage) ? item.stage : "created";
	const currentIndex = stages.indexOf(current);
	const route = stages.map((key, index) => ({
		key,
		state: index < currentIndex || (key === current && item.answerable) ? "complete" : key === current ? "active" : "pending",
		at: null,
		detail: null,
	}));
	const timeline = events.slice(-128).map((event) => {
		const value = event && typeof event === "object" && !Array.isArray(event) ? event as Record<string, unknown> : {};
		return {
			type: text(value.type, 100) || "event",
			at: text(value.at, 80) || null,
			detail: text(value.notes || value.outcome || value.reason, 320) || null,
			status: value.failed === true || value.status === "failed" ? "failed" as const : value.observed === true ? "observed" as const : "ok" as const,
		};
	});
	const sourceRefs = Array.isArray(gateObject.source_refs) ? gateObject.source_refs : [];
	const sources = sourceRefs.map((source) => ({ path: text(source, 480), status: "inspected", hash: null, verified: false }));
	const bindings = Array.isArray(gateObject.claim_bindings) ? gateObject.claim_bindings : [];
	const claims = bindings.map((binding) => {
		const value = binding && typeof binding === "object" && !Array.isArray(binding) ? binding as Record<string, unknown> : {};
		const support = Array.isArray(value.sources) ? value.sources.map((source) => {
			if (source && typeof source === "object" && !Array.isArray(source)) return text((source as Record<string, unknown>).path, 480);
			return text(source, 480);
		}).filter(Boolean) : [];
		return { id: text(value.id, 120) || null, claim: text(value.claim, 480), support, status: text(value.status || value.relationship, 80) || "bound" };
	}).filter((claim) => claim.claim);
	const warnings = Array.isArray(gateObject.warnings) ? gateObject.warnings.map((warning) => text(warning, 240)).filter(Boolean) : [];
	const archiveCount = Number(gateObject.archive_count);
	const reuseCount = Number(gateObject.reuse_count);
	return {
		...item,
		route,
		timeline,
		sources,
		claims,
		warnings,
		coverage: metadata.retrieval_coverage && typeof metadata.retrieval_coverage === "object" && !Array.isArray(metadata.retrieval_coverage)
			? metadata.retrieval_coverage as Record<string, unknown>
			: null,
		archive: { count: Number.isFinite(archiveCount) ? archiveCount : 0, reused: Number.isFinite(reuseCount) ? reuseCount : 0, verified: false },
	};
}

async function configuredResultsRoot(port: ResearchHostPort, workspace: string): Promise<ResearchResolvedRoot> {
	const workspaceRoot = await port.resolveRoot(workspace);
	if (!workspaceRoot.handle) throw new Error("Host did not grant a workspace files root");
	let config: ResearchWorkspaceConfig = {};
	try {
		config = asObject(JSON.parse(await port.readText(workspaceRoot.handle, ".pi/research-workspace.json")), "research workspace configuration");
	} catch (error) {
		if (!isErrno(error, "ENOENT")) throw error;
	}
	if (config.resultsRoot !== undefined && typeof config.resultsRoot !== "string") throw new Error("resultsRoot must be a path");
	if (!config.resultsRoot || !config.resultsRoot.startsWith("/"))
		return { handle: workspaceRoot.handle, path: relativePath(config.resultsRoot || "results", "resultsRoot") };
	const resultRoot = await port.resolveRoot(config.resultsRoot);
	if (!resultRoot.handle) throw new Error("Host did not grant the configured results root");
	return { handle: resultRoot.handle, path: "" };
}

async function readMetadata(port: ResearchHostPort, root: ResearchResolvedRoot, runDir: string): Promise<RunMetadata> {
	const normalized = relativePath(runDir, "runDir");
	const segments = normalized.split("/");
	if (segments.length !== 2 || !segments[1].startsWith("run-"))
		throw new Error("runDir must be a result slug followed by a run directory");
	const path = [root.path, normalized, "metadata.json"].filter(Boolean).join("/");
	return asObject(JSON.parse(await port.readText(root.handle, path)), "research run metadata") as RunMetadata;
}

async function discover(port: ResearchHostPort, root: ResearchResolvedRoot, project?: string | null): Promise<ResearchRunSummary[]> {
	let slugs: readonly ResearchFileEntry[];
	try {
		slugs = await port.listFiles(root.handle, root.path);
	} catch (error) {
		if (isErrno(error, "ENOENT")) return [];
		throw error;
	}
	const found: ResearchRunSummary[] = [];
	for (const slug of slugs.filter(entry => entry.kind === "directory" && !entry.name.startsWith("."))) {
		const slugPath = [root.path, relativePath(slug.name, "result slug")].filter(Boolean).join("/");
		const runs = await port.listFiles(root.handle, slugPath);
		for (const run of runs.filter(entry => entry.kind === "directory" && entry.name.startsWith("run-"))) {
			const runDir = `${slug.name}/${run.name}`;
			const metadata = await readMetadata(port, root, runDir);
			if (!project || text(metadata.project, 180) === text(project, 180)) found.push(summary(metadata, runDir, root.path));
		}
	}
	return found.sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));
}

function limitOf(value: unknown): number {
	return Math.max(1, Math.min(50, Number(value) || 10));
}

/** Build read-only research operations over a host-granted file port. */
export function createResearchHost(port: ResearchHostPort): ResearchHostAdapter {
	const listRuns = async (input: ResearchRunListInput): Promise<ResearchRunListResult> => {
		const root = await configuredResultsRoot(port, input.workspace);
		const items = await discover(port, root, input.project);
		return { items: items.slice(0, limitOf(input.limit)), total: items.length };
	};
	const status = async (input: ResearchRunStatusInput): Promise<ResearchRunListResult | { item: ResearchRunSummary }> => {
		const root = await configuredResultsRoot(port, input.workspace);
		if (input.runDir !== undefined && input.runDir !== null) {
			const runDir = relativePath(text(input.runDir, 240), "runDir");
			const metadata = await readMetadata(port, root, runDir);
			return { item: summary(metadata, runDir, root.path) };
		}
		const items = await discover(port, root, input.project);
		return { items: items.slice(0, limitOf(input.limit)), total: items.length };
	};
	const detailOperation = async (input: ResearchRunDetailInput): Promise<ResearchRunDetail> => {
		const root = await configuredResultsRoot(port, input.workspace);
		let runDir = input.runDir ? relativePath(text(input.runDir, 240), "runDir") : null;
		if (!runDir && input.runId) {
			const items = await discover(port, root);
			runDir = items.find((item) => item.runId === text(input.runId, 180))?.runDir ?? null;
		}
		if (!runDir) throw new Error("Research run detail requires runDir or runId");
		const metadata = await readMetadata(port, root, runDir);
		return detail(metadata, runDir, root.path);
	};
	return { contractVersion: 1, operations: { status, listRuns, detail: detailOperation } };
}

/** Register the read-only operations in a host's operation registry. */
export function registerResearchHost(registry: ResearchHostRegistry, port: ResearchHostPort): ResearchHostAdapter {
	const adapter = createResearchHost(port);
	registry.register("status", adapter.operations.status);
	registry.register("listRuns", adapter.operations.listRuns);
	if (adapter.operations.detail) registry.register("detail", adapter.operations.detail);
	return adapter;
}

export const researchHostLoader: ResearchHostLoader = {
	contractVersion: 1,
	load: createResearchHost,
};

import {
	createResearchConnectorHostLoader,
	type ResearchConnectorHostLoader,
} from "./research-connectors.js";

export type {
	ResearchConnectorContext,
	ResearchConnectorDescriptor,
	ResearchConnectorFailure,
	ResearchConnectorHit,
	ResearchConnectorHostAdapter,
	ResearchConnectorHostLoader,
	ResearchConnectorHostOptions,
	ResearchConnectorKind,
	ResearchConnectorSourceReceipt,
	ResearchProjectStorageItem,
	ResearchProjectStoragePort,
	ResearchSearchRequest,
	ResearchSearchResponse,
} from "./research-connectors.js";

interface ResearchWriteAdapterHostAdapter {
	readonly contractVersion: 1;
	readonly status: "ready" | "degraded" | "unavailable";
	readonly descriptors: () => readonly unknown[];
	readonly prepare: (...args: readonly unknown[]) => never;
	readonly execute: (...args: readonly unknown[]) => Promise<never>;
}

interface ResearchWriteAdapterHostLoader {
	readonly contractVersion: 1;
	readonly load: () => ResearchWriteAdapterHostAdapter;
}

const UNAVAILABLE_WRITE_MESSAGE =
	"Research write adapters are unavailable; the host must inject an authorized write registry";

/**
 * Contract-only loader for hosts that do not provide connector transport yet.
 * It fails closed instead of pretending that an empty registry is a successful
 * search. Hosts can replace this loader with an authorized implementation.
 */
export const researchConnectorHostLoader: ResearchConnectorHostLoader = createResearchConnectorHostLoader({});

/**
 * Contract-only write loader. Preparation and execution are both explicit
 * failures until the host supplies authorization and a write-back port.
 */
export const researchWriteAdapterHostLoader: ResearchWriteAdapterHostLoader = {
	contractVersion: 1,
	load(): ResearchWriteAdapterHostAdapter {
		return {
			contractVersion: 1,
			status: "unavailable",
			descriptors: () => [],
			prepare: (..._args: readonly unknown[]) => {
				throw new Error(UNAVAILABLE_WRITE_MESSAGE);
			},
			execute: async (..._args: readonly unknown[]) => {
				throw new Error(UNAVAILABLE_WRITE_MESSAGE);
			},
		};
	},
};

export { createResearchConnectorHostLoader } from "./research-connectors.js";
