import { Worker } from "node:worker_threads";
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
	const operations = new Set<Promise<unknown>>();
	let registered = false;
	let closed = false;
	let cleanup: (() => Promise<void>) | null = null;
	let disposal: Promise<void> | null = null;
	function run<T>(work: () => T | Promise<T>, signal = controller.signal): Promise<T> {
		if (closed) throw new Error("Knowledge session has been disposed");
		const operation = owner.run(async () => {
			signal.throwIfAborted();
			const result = await work();
			signal.throwIfAborted();
			return result;
		});
		operations.add(operation);
		return operation.finally(() => operations.delete(operation));
	}
	function dispose(): Promise<void> {
		if (disposal) return disposal;
		closed = true;
		controller.abort(new Error("Knowledge session has been disposed"));
		const serviceDrain = services.dispose();
		disposal = (async () => {
			const cleanupResult = await Promise.allSettled([cleanup?.()]);
			// Callers still receive their individual operation failures. Shutdown
			// waits for settlement before releasing this session's owner reference.
			await Promise.allSettled([...operations, serviceDrain]);
			detach();
			if (cleanupResult[0].status === "rejected") throw cleanupResult[0].reason;
		})();
		return disposal;
	}
	const detach = owner.attachSession(dispose);
	function extension(pi: any): void {
		owner.assertActive();
		if (closed || registered) throw new Error("A native knowledge session can only be registered once");
		registered = true;
		const scopedContext = (context: any, signal: AbortSignal) => new Proxy(context, {
			get(target, property) { return property === "signal" ? signal : Reflect.get(target, property, target); },
		});
		const scopedSignal = (signal?: AbortSignal) => signal
			? AbortSignal.any([controller.signal, signal]) : controller.signal;
		const ownedPi = new Proxy(pi, {
			get(target, property) {
				if (property === "registerTool") return (definition: any) => target.registerTool({
					...definition,
					execute: (id: string, input: unknown, signal: AbortSignal | undefined, update: unknown, context: any) => {
						const combined = scopedSignal(signal);
						return run(() => definition.execute(id, input, combined, update, scopedContext(context, combined)), combined);
					},
				});
				if (property === "registerCommand") return (name: string, definition: any) => target.registerCommand(name, {
					...definition,
					handler: (args: string, context: any) => {
						const signal = scopedSignal(context.signal);
						return run(() => definition.handler(args, scopedContext(context, signal)), signal);
					},
				});
				if (property === "on") return (event: string, handler: (...args: any[]) => unknown) => target.on(
					event, event === "session_shutdown" ? handler : (value: unknown, context: any) =>
						{
						const signal = scopedSignal(context.signal);
						return run(() => handler(value, scopedContext(context, signal)), signal);
					},
				);
				return Reflect.get(target, property, target);
			},
		});
		registerNativeStatusTools(ownedPi, { ...owner, services });
		cleanup = knowledge.registerKnowledgeInterface(ownedPi).dispose;
		pi.on("session_shutdown", dispose);
	}
	return { extension, publication, services, signal: controller.signal, dispose };
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
