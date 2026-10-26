import type {
	PluginRuntimeFactory,
	PluginRuntimeFactoryContext,
	PluginRuntimeOperation,
	PluginRuntimeScope,
} from "@gyoungwe/plugin-api/runtime";

interface FileEntry {
	name: string;
	kind: "file" | "directory" | "symlink" | "other";
}
interface ResearchWorkspaceConfig { resultsRoot?: string }
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
interface RunSummary {
	runId: string;
	resultSlug: string;
	project: string;
	topicId: string | null;
	query: string;
	status: string;
	stage: string;
	answerable: boolean;
	startedAt: string | null;
	updatedAt: string | null;
	runDir: string;
}
interface ResolvedResultsRoot { handle: string; path: string }
type DesktopCapabilities = PluginRuntimeFactoryContext["capabilities"];

const STAGES = new Set([
	"created", "local_query_recorded", "external_search_recorded", "sources_inspected",
	"sources_archived", "sources_reused", "claims_bound", "answerable",
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
function scopeWorkspace(scope: PluginRuntimeScope): string {
	if (scope.kind === "application") throw new Error("Research status requires a selected workspace");
	return scope.workspaceDirectory;
}
function asObject(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
	return value as Record<string, unknown>;
}
function gate(metadata: RunMetadata): { stage: string; answerable: boolean } {
	const value = metadata.evidence_gate;
	if (!value || typeof value !== "object" || Array.isArray(value)) return { stage: "created", answerable: false };
	const candidate = value as Record<string, unknown>;
	const stage = text(candidate.stage, 80);
	return { stage: STAGES.has(stage) ? stage : "created", answerable: candidate.answerable === true };
}
function summary(metadata: RunMetadata, runDir: string, resultsPath: string): RunSummary {
	const evidence = gate(metadata);
	const normalizedRunDir = runDir.replaceAll("\\", "/");
	const relativeRunDir = resultsPath && normalizedRunDir.startsWith(`${resultsPath}/`)
		? normalizedRunDir.slice(resultsPath.length + 1) : normalizedRunDir;
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
async function call(capabilities: DesktopCapabilities, name: string, input: unknown): Promise<unknown> {
	return capabilities.call(name, input);
}
async function readText(capabilities: DesktopCapabilities, root: string, path: string): Promise<string> {
	const response = await call(capabilities, "files.readText", { root, path }) as { text?: unknown };
	if (!response || typeof response.text !== "string") throw new Error(`Host returned invalid text for ${path}`);
	return response.text;
}
async function listFiles(capabilities: DesktopCapabilities, root: string, path: string): Promise<FileEntry[]> {
	const response = await call(capabilities, "files.list", { root, path });
	if (!Array.isArray(response)) throw new Error(`Host returned invalid directory listing for ${path}`);
	return response.map(value => {
		const entry = asObject(value, "directory entry");
		if (typeof entry.name !== "string" || typeof entry.kind !== "string") throw new Error("Host returned an invalid directory entry");
		return { name: entry.name, kind: ["file", "directory", "symlink", "other"].includes(entry.kind) ? entry.kind as FileEntry["kind"] : "other" };
	});
}
async function configuredResultsRoot(capabilities: DesktopCapabilities, workspace: string): Promise<ResolvedResultsRoot> {
	const workspaceRoot = await call(capabilities, "roots.resolve", { path: workspace, kind: "files" }) as { handle?: unknown };
	if (!workspaceRoot || typeof workspaceRoot.handle !== "string" || !workspaceRoot.handle)
		throw new Error("Host did not grant a workspace files root");
	let config: ResearchWorkspaceConfig = {};
	try {
		config = asObject(JSON.parse(await readText(capabilities, workspaceRoot.handle, ".pi/research-workspace.json")), "research workspace configuration") as ResearchWorkspaceConfig;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	if (config.resultsRoot !== undefined && typeof config.resultsRoot !== "string") throw new Error("resultsRoot must be a path");
	if (!config.resultsRoot || !config.resultsRoot.startsWith("/"))
		return { handle: workspaceRoot.handle, path: relativePath(config.resultsRoot || "results", "resultsRoot") };
	const resultRoot = await call(capabilities, "roots.resolve", { path: config.resultsRoot, kind: "files" }) as { handle?: unknown };
	if (!resultRoot || typeof resultRoot.handle !== "string" || !resultRoot.handle)
		throw new Error("Host did not grant the configured results root");
	return { handle: resultRoot.handle, path: "" };
}
async function readMetadata(capabilities: DesktopCapabilities, root: ResolvedResultsRoot, runDir: string): Promise<RunMetadata> {
	const normalized = relativePath(runDir, "runDir");
	const segments = normalized.split("/");
	if (segments.length !== 2 || !segments[1].startsWith("run-"))
		throw new Error("runDir must be a result slug followed by a run directory");
	const path = [root.path, normalized, "metadata.json"].filter(Boolean).join("/");
	return asObject(JSON.parse(await readText(capabilities, root.handle, path)), "research run metadata") as RunMetadata;
}
async function discover(capabilities: DesktopCapabilities, root: ResolvedResultsRoot, project?: string): Promise<RunSummary[]> {
	let slugs: FileEntry[];
	try { slugs = await listFiles(capabilities, root.handle, root.path); }
	catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
	const found: RunSummary[] = [];
	for (const slug of slugs.filter(entry => entry.kind === "directory" && !entry.name.startsWith("."))) {
		const slugPath = [root.path, relativePath(slug.name, "result slug")].filter(Boolean).join("/");
		const runs = await listFiles(capabilities, root.handle, slugPath);
		for (const run of runs.filter(entry => entry.kind === "directory" && entry.name.startsWith("run-"))) {
			const runDir = `${slug.name}/${run.name}`;
			const metadata = await readMetadata(capabilities, root, runDir);
			if (!project || text(metadata.project, 180) === project) found.push(summary(metadata, runDir, root.path));
		}
	}
	return found.sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));
}
function paramsOf(input: unknown): Record<string, unknown> {
	return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}
function limitOf(value: unknown): number { return Math.max(1, Math.min(50, Number(value) || 10)); }

/** Read-only Desktop runtime. All file access goes through host-granted roots. */
const createDesktopRuntime: PluginRuntimeFactory = async context => {
	const status: PluginRuntimeOperation = {
		inputSchema: { type: "object" }, resultSchema: { type: "object" }, effect: "read",
		execute: async (input, callContext) => {
			const workspace = scopeWorkspace(callContext.scope);
			const params = paramsOf(input);
			const root = await configuredResultsRoot(callContext.capabilities, workspace);
			if (params.runDir !== undefined) {
				const runDir = relativePath(text(params.runDir, 240), "runDir");
				const metadata = await readMetadata(callContext.capabilities, root, runDir);
				return { item: summary(metadata, runDir, root.path) };
			}
			const project = params.project === undefined ? undefined : text(params.project, 180);
			const items = await discover(callContext.capabilities, root, project);
			return { items: items.slice(0, limitOf(params.limit)), total: items.length };
		},
	};
	const listRuns: PluginRuntimeOperation = {
		inputSchema: { type: "object" }, resultSchema: { type: "object" }, effect: "read",
		execute: async (input, callContext) => {
			const workspace = scopeWorkspace(callContext.scope);
			const params = paramsOf(input);
			const root = await configuredResultsRoot(callContext.capabilities, workspace);
			const project = params.project === undefined ? undefined : text(params.project, 180);
			const items = await discover(callContext.capabilities, root, project);
			return { items: items.slice(0, limitOf(params.limit)), total: items.length };
		},
	};
	return { operations: { status, listRuns }, dispose: async () => {} };
};

export default createDesktopRuntime;
