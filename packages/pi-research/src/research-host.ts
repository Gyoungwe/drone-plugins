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

export interface ResearchHostOperations {
	status(input: ResearchRunStatusInput): Promise<ResearchRunListResult | { item: ResearchRunSummary }>;
	listRuns(input: ResearchRunListInput): Promise<ResearchRunListResult>;
}

export interface ResearchHostAdapter {
	readonly contractVersion: 1;
	readonly operations: ResearchHostOperations;
}

export interface ResearchHostRegistry {
	register(name: "status" | "listRuns", operation: ResearchHostOperations["status"] | ResearchHostOperations["listRuns"]): void;
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
	return { contractVersion: 1, operations: { status, listRuns } };
}

/** Register the read-only operations in a host's operation registry. */
export function registerResearchHost(registry: ResearchHostRegistry, port: ResearchHostPort): ResearchHostAdapter {
	const adapter = createResearchHost(port);
	registry.register("status", adapter.operations.status);
	registry.register("listRuns", adapter.operations.listRuns);
	return adapter;
}

export const researchHostLoader: ResearchHostLoader = {
	contractVersion: 1,
	load: createResearchHost,
};
