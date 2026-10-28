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
import { createKnowledgePublication, createManagedKnowledgePublication } from "../core/publication.js";
import { createKnowledgeInterface, registerKnowledgeInterface, registerWikiReviewAcceptance, type KnowledgeInterfaceSessionPorts } from "./internal-knowledge-extension.js";

function configureWorker(owner: KnowledgeRuntime): void {
	owner.host.configureKnowledgeWorker((_requestedUrl, options) => {
		const workerUrl = new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url);
		return new Worker(workerUrl, options as never);
	});
}

async function localService(owner: KnowledgeSessionOwner, ctx: any, query = "", projectFor = currentProject) {
	const { readKnowledgeBinding } = owner.config;
	const { getKnowledgeService } = owner.services;
	const binding = await readKnowledgeBinding();
	if (!binding) return null;
	const cwd = String(ctx?.cwd || process.cwd());
	const project = await projectFor(cwd, ctx);
	const service = await getKnowledgeService(binding);
	return { binding, cwd, project, service, query };
}

function registerNativeStatusTools(pi: any, owner: KnowledgeSessionOwner, projectFor = currentProject, session?: KnowledgeInterfaceSessionPorts): void {
	const { readKnowledgeBinding } = owner.config;
	pi.registerTool({
		name: "knowledge_status",
		label: "Knowledge status",
		drone: { readOnly: true, capabilities: ["knowledge"] },
		description: "Report whether the application knowledge Vault is configured.",
		parameters: { type: "object", properties: {} },
		async execute(_id: string, _params: unknown, _signal: AbortSignal, _update: unknown, ctx: any) {
			const binding = await readKnowledgeBinding();
			if (!binding) return result({ status: "unconfigured", next: "/drone-init", revision: 0 });
			const local = await localService(owner, ctx, "", projectFor);
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
			const local = await localService(owner, ctx, query, projectFor);
			if (!local) return result({ query, hits: [], local: { status: "unconfigured", hitCount: 0 }, remoteFallback: { status: "blocked" } });
			const limit = Math.max(1, Math.min(12, Number(params?.limit) || 6));
			const found = await local.service.request("search", { query, project: local.project, limit });
			return result({ query, hits: (found?.hits || []).slice(0, limit), local: { status: "searched", hitCount: found?.hits?.length || 0, revision: found?.revision ?? null, coverage: found?.coverage ?? null }, remoteFallback: { status: (found?.hits?.length || 0) < limit ? "prompt" : "not-needed" } });
		},
	});

	pi.registerCommand?.("drone-init", {
		description: "Initialize the Drone knowledge Vault",
		handler: async (_args: unknown, ctx: any) => {
			if (session) { await session.notify("Open knowledge settings or run /obsidian-setup to initialize the application knowledge Vault.", ctx); return; }
			if (typeof pi.sendUserMessage === "function") await pi.sendUserMessage("/obsidian-setup", { deliverAs: "followUp" });
			else ctx?.ui?.notify?.("Run /obsidian-setup to initialize the knowledge Vault", "info");
		},
	});
}

export { registerKnowledgeInterface, registerWikiReviewAcceptance };
export { createSpecialistBudget, decideSpecialistRun } from "../core/orchestration-policy.js";

export type KnowledgeSessionOwner = Pick<KnowledgeRuntime,
	"assertActive" | "run" | "attachSession" | "dispose" | "host" | "reviewPolicy" |
	"delivery" | "specialistTools" | "topics" | "ui" | "wiki" | "extensionHost"> & {
	config: Pick<KnowledgeRuntime["config"], "readKnowledgeBinding" | "withKnowledgeBinding">;
	services: Pick<KnowledgeRuntime["services"], "getKnowledgeService">;
};
interface ManagedSessionComposition {
	readonly session: KnowledgeInterfaceSessionPorts;
	readonly project: typeof currentProject;
	readonly registerReadTools: (pi: any) => void;
}

/** Adapt only our domain handlers, without pretending to implement the managed Pi context. */
function managedDomainPi(pi: any, session: KnowledgeInterfaceSessionPorts) {
	const contextFor = async (context: any) => {
		const facts = await session.inspect(context);
		return {
		cwd: context.cwd,
		signal: context.signal,
		hasUI: false,
		sessionManager: { getSessionId: () => context.sessionManager.getSessionId() },
		isProjectTrusted: () => facts.projectTrusted,
		};
	};
	return new Proxy(pi, { get(target, property) {
		if (property === "registerTool") return (definition: any) => target.registerTool({
			...definition,
			execute: async (id: string, input: unknown, signal: AbortSignal, update: unknown, context: any) =>
				definition.execute(id, input, signal, update, await contextFor(context)),
		});
		if (property === "registerCommand") return (name: string, definition: any) => target.registerCommand(name, {
			...definition, handler: async (args: string, context: any) => definition.handler(args, await contextFor(context)),
		});
		if (property === "on") return (name: string, handler: any) => target.on(name,
			name === "session_shutdown" ? handler : async (event: unknown, context: any) => handler(event, await contextFor(context)));
		return Reflect.get(target, property, target);
	} });
}

function composeNativeSession(owner: KnowledgeSessionOwner, managed?: ManagedSessionComposition) {
	owner.assertActive();
	const controller = new AbortController();
	const managedPublication = managed ? createManagedKnowledgePublication(owner.ui, owner.reviewPolicy, controller.signal) : undefined;
	const publication = managedPublication ?? createKnowledgePublication(owner.ui, owner.reviewPolicy, owner.config as KnowledgeRuntime["config"], controller.signal);
	const services = createKnowledgeSessionServices(owner.services, controller.signal);
	const knowledge = createKnowledgeInterface({
		host: owner.host, config: owner.config, services,
		publication, delivery: owner.delivery, specialists: owner.specialistTools,
		topics: owner.topics, ui: owner.ui, wiki: owner.wiki,
		...(managed ? { available: () => true, project: managed.project, session: managed.session } : {}),
	}, owner.extensionHost);
	let cleanup: (() => Promise<void>) | null = null;
	const adapter = createKnowledgeNativeAdapter(owner, controller, nativePi => {
		const pi = managed ? managedDomainPi(nativePi, managed.session) : nativePi;
		if (managed) managed.registerReadTools(nativePi);
		else registerNativeStatusTools(nativePi, { ...owner, services });
		const session = knowledge.registerKnowledgeInterface(pi);
		cleanup = session.dispose;
		pi.on("before_agent_start", (event: any, context: any) => session.beforeStart(event, context));
	}, async () => {
		const results = await Promise.allSettled([services.dispose(), cleanup?.()]);
		const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
		if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Knowledge session cleanup failed");
	});
	return {
		...adapter, publication, services,
		...(managedPublication ? { projection: managedPublication.projection } : {}),
	};
}

/** Official CLI keeps its real SDK context and hooks. */
export function createNativeSession(owner: KnowledgeRuntime) { return composeNativeSession(owner); }

/** Desktop uses the same complete knowledge interface and publication algorithm in its actual package owner. */
export function createManagedNativeSession(owner: KnowledgeSessionOwner, composition: ManagedSessionComposition) {
	return composeNativeSession(owner, composition);
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
