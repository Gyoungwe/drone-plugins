import { Worker } from "node:worker_threads";
import { createKnowledgeNativeAdapter } from "../core/native-session-lifecycle.js";
import {
	createKnowledgeConfigApi,
	createKnowledgeRuntimeHost,
	currentProject,
	result,
} from "../core/index.js";
import { createKnowledgeRuntime, type KnowledgeRuntime } from "../core/knowledge-runtime.js";
import { createKnowledgeSessionServices } from "../core/session-services.js";
import { createKnowledgePublication } from "../core/publication.js";
import { createKnowledgeInterface, registerKnowledgeInterface, registerWikiReviewAcceptance } from "./internal-knowledge-extension.js";

function configureWorker(owner: KnowledgeRuntime): void {
	owner.host.configureKnowledgeWorker((_requestedUrl, options) => {
		const workerUrl = new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url);
		return new Worker(workerUrl, options as never);
	});
}

async function localService(owner: Pick<KnowledgeRuntime, "config"> & { services: Pick<KnowledgeRuntime["services"], "getKnowledgeService"> }, ctx: any, query = "") {
	const { readKnowledgeBinding } = owner.config;
	const { getKnowledgeService } = owner.services;
	const binding = await readKnowledgeBinding();
	if (!binding) return null;
	const cwd = String(ctx?.cwd || process.cwd());
	const project = await currentProject(cwd, ctx);
	const service = await getKnowledgeService(binding);
	return { binding, cwd, project, service, query };
}

function registerNativeStatusTools(pi: any, owner: Pick<KnowledgeRuntime, "config"> & { services: Pick<KnowledgeRuntime["services"], "getKnowledgeService"> }): void {
	const { knowledgeDirectory, readKnowledgeBinding } = owner.config;
	pi.registerTool({
		name: "knowledge_status",
		label: "Knowledge status",
		drone: { readOnly: true, capabilities: ["knowledge"] },
		description: "Report whether the application knowledge Vault is configured.",
		parameters: { type: "object", properties: {} },
		async execute(_id: string, _params: unknown, _signal: AbortSignal, _update: unknown, ctx: any) {
			const binding = knowledgeDirectory() ? await readKnowledgeBinding() : null;
			if (!binding) return result({ status: "unconfigured", next: "/drone-init", revision: 0 });
			const local = await localService(owner, ctx);
			if (!local) return result({ status: "unconfigured", next: "/drone-init", revision: binding.revision });
			const index = await local.service.request("status");
			return result({ status: "configured", vault: binding.vault, project: local.project, revision: Number(index?.revision ?? binding.revision ?? 0), index });
		},
	});

	pi.registerTool({
		name: "knowledge_search",
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
			const local = await localService(owner, ctx, query);
			if (!local) return result({ query, hits: [], local: { status: "unconfigured", hitCount: 0 }, remoteFallback: { status: "blocked" } });
			const limit = Math.max(1, Math.min(12, Number(params?.limit) || 6));
			const found = await local.service.request("search", { query, project: local.project, limit });
			return result({ query, hits: (found?.hits || []).slice(0, limit), local: { status: "searched", hitCount: found?.hits?.length || 0, revision: found?.revision ?? null, coverage: found?.coverage ?? null }, remoteFallback: { status: (found?.hits?.length || 0) < limit ? "prompt" : "not-needed" } });
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

export { registerKnowledgeInterface, registerWikiReviewAcceptance };
export { createSpecialistBudget, decideSpecialistRun } from "../core/orchestration-policy.js";

/** One managed native session, including its unforgeable publication projection. */
export function createNativeSession(owner: KnowledgeRuntime) {
	owner.assertActive();
	const controller = new AbortController();
	const publication = createKnowledgePublication(owner.ui, owner.reviewPolicy, owner.config, controller.signal);
	const services = createKnowledgeSessionServices(owner.services, controller.signal);
	const knowledge = createKnowledgeInterface({
		host: owner.host, config: owner.config, services,
		publication, delivery: owner.delivery, specialists: owner.specialistTools,
		topics: owner.topics, ui: owner.ui, wiki: owner.wiki,
	}, owner.extensionHost);
	let cleanup: (() => Promise<void>) | null = null;
	const adapter = createKnowledgeNativeAdapter(owner, controller, pi => {
		registerNativeStatusTools(pi, { ...owner, services });
		cleanup = knowledge.registerKnowledgeInterface(pi).dispose;
	}, async () => {
		const results = await Promise.allSettled([services.dispose(), cleanup?.()]);
		const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
		if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Knowledge session cleanup failed");
	});
	return { ...adapter, publication, services };
}

/** Official Pi factory shape; each registration receives a fresh session adapter. */
export function createNativeExtension(owner: KnowledgeRuntime) {
	return (pi: any): void => createNativeSession(owner).extension(pi);
}

/** CLI owns one runtime; Desktop supplies its managed owner to createNativeExtension. */
export default function registerPiKnowledge(pi: any): void {
	const owner = createKnowledgeRuntime(createKnowledgeConfigApi(), createKnowledgeRuntimeHost());
	configureWorker(owner);
	createNativeExtension(owner)(pi);
	pi.on("session_shutdown", () => owner.dispose());
}
