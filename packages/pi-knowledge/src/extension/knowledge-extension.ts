import { Worker } from "node:worker_threads";
import {
	configureKnowledgeWorker,
	currentProject,
	getKnowledgeService,
	knowledgeDirectory,
	readKnowledgeBinding,
	result,
} from "../core/index.js";

const STATUS_TOOL = "knowledge_status";
const SEARCH_TOOL = "knowledge_search";

function statusLine(revision: number, coverage: unknown): string {
	return `knowledge_status revision=${Number.isSafeInteger(revision) ? revision : 0} coverage=${String(coverage || "unknown")}`;
}

function configureWorker(): void {
	configureKnowledgeWorker((_requestedUrl, options) => {
		const workerUrl = new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url);
		return new Worker(workerUrl, options as never);
	});
}

async function localService(ctx: any, query = "") {
	const binding = await readKnowledgeBinding();
	if (!binding) return null;
	const cwd = String(ctx?.cwd || process.cwd());
	const project = await currentProject(cwd, ctx);
	const service = await getKnowledgeService(binding);
	return { binding, cwd, project, service, query };
}

export default function registerPiKnowledge(pi: any): void {
	configureWorker();
	pi.registerTool({
		name: STATUS_TOOL,
		label: "Knowledge status",
		drone: { readOnly: true, capabilities: ["knowledge"] },
		description: "Report whether the application knowledge Vault is configured.",
		parameters: { type: "object", properties: {} },
		async execute(_id: string, _params: unknown, _signal: AbortSignal, _update: unknown, ctx: any) {
			if (!knowledgeDirectory())
				return result({ status: "unconfigured", next: "/drone-init", revision: 0, stableLine: statusLine(0, "unconfigured") });
			const binding = await readKnowledgeBinding();
			if (!binding)
				return result({ status: "unconfigured", next: "/drone-init", revision: 0, stableLine: statusLine(0, "unconfigured") });
			const local = await localService(ctx);
			if (!local) return result({ status: "unconfigured", next: "/drone-init", revision: binding.revision, stableLine: statusLine(binding.revision, "unconfigured") });
			const index = await local.service.request("status");
			const revision = Number(index?.revision ?? binding.revision ?? 0);
			return result({
				status: "configured",
				vault: binding.vault,
				project: local.project,
				revision,
				stableLine: statusLine(revision, index?.coverage),
				index,
			});
		},
	});

	pi.registerTool({
		name: SEARCH_TOOL,
		label: "Knowledge · local search",
		drone: { readOnly: true, recoverySafe: true, capabilities: ["knowledge"] },
		description: "Search the bound local knowledge Vault.",
		parameters: {
			type: "object",
			properties: { query: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 12 } },
			required: ["query"],
		},
		async execute(_id: string, params: any, _signal: AbortSignal, _update: unknown, ctx: any) {
			const query = String(params?.query || "").trim().slice(0, 2_000);
			if (!query) throw new Error("query is required");
			const local = await localService(ctx, query);
			if (!local)
				return result({ query, hits: [], local: { status: "unconfigured", hitCount: 0 }, remoteFallback: { status: "blocked" } });
			const limit = Math.max(1, Math.min(12, Number(params?.limit) || 6));
			const found = await local.service.request("search", { query, project: local.project, limit });
			return result({
				query,
				hits: (found?.hits || []).slice(0, limit),
				local: { status: "searched", hitCount: found?.hits?.length || 0, revision: found?.revision ?? null, coverage: found?.coverage ?? null },
				remoteFallback: { status: (found?.hits?.length || 0) < limit ? "prompt" : "not-needed" },
			});
		},
	});

	pi.registerCommand?.("drone-init", {
		description: "Initialize the Drone knowledge Vault",
		handler: async (_args: unknown, ctx: any) => {
			if (typeof pi.sendUserMessage === "function") await pi.sendUserMessage("/obsidian-setup", { deliverAs: "followUp" });
			else ctx?.ui?.notify?.("Run /obsidian-setup to initialize the knowledge Vault", "info");
		},
	});
}
