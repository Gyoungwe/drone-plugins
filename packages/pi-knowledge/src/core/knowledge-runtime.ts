import type { KnowledgeExtensionHost } from "@gyoungwe/plugin-api/knowledge";
import type { KnowledgeConfigApi } from "./config.js";
import type { KnowledgeRuntimeHost } from "./runtime-host.js";
import { createKnowledgeUi } from "./ui-state.js";
import { createSemanticSettingsApi } from "./semantic-settings.js";
import { createKnowledgeReviewPolicy } from "./review-policy.js";
import { createKnowledgeServicePool } from "./service.js";
import { createKnowledgeSpecialistHost } from "./specialist-host.js";
import { createKnowledgeSpecialistTools } from "./specialists.js";
import { createKnowledgeWikiReview } from "./wiki-review.js";
import { createTopicMemoryApi } from "./topic-memory.js";
import { createSpecialistDelivery } from "./specialist-delivery.js";
import { acquireKnowledgeWriterLease } from "./writer-lease.js";

/** Plugin-owned application resources. Publication identities live in session adapters. */
export function createKnowledgeRuntime(
	config: KnowledgeConfigApi,
	host: KnowledgeRuntimeHost,
	extensionHost: KnowledgeExtensionHost = {},
	acquireWriterLease: typeof acquireKnowledgeWriterLease = acquireKnowledgeWriterLease,
) {
	const ui = createKnowledgeUi(host, config);
	const semantic = createSemanticSettingsApi(undefined, config.knowledgeDirectory());
	const reviewPolicy = createKnowledgeReviewPolicy(config);
	const services = createKnowledgeServicePool(host, config, ui, semantic, reviewPolicy, acquireWriterLease);
	const specialists = createKnowledgeSpecialistHost(host, config, ui);
	const specialistTools = createKnowledgeSpecialistTools(host, config, specialists, ui);
	const wiki = createKnowledgeWikiReview(host, config, reviewPolicy, ui);
	const topics = createTopicMemoryApi(host, config);
	const delivery = createSpecialistDelivery(host, config);
	const operations = new Set<Promise<unknown>>();
	const sessions = new Set<() => Promise<void>>();
	let disposed = false;
	let disposal: Promise<void> | null = null;
	function assertActive() {
		if (disposed) throw new Error("Knowledge runtime has been disposed");
	}
	function run<T>(work: () => T | Promise<T>): Promise<T> {
		assertActive();
		const operation = Promise.resolve().then(work);
		operations.add(operation);
		return operation.finally(() => operations.delete(operation));
	}
	function attachSession(close: () => Promise<void>) {
		assertActive();
		sessions.add(close);
		return () => { sessions.delete(close); };
	}
	function dispose(): Promise<void> {
		if (disposal) return disposal;
		disposed = true;
		disposal = (async () => {
			const sessionResults = await Promise.allSettled([...sessions].map((close) => close()));
			sessions.clear();
			specialists.dispose();
			const operationResults = await Promise.allSettled([...operations]);
			const serviceResults = await Promise.allSettled([services.dispose()]);
			ui.dispose();
			const failures = [...sessionResults, ...operationResults, ...serviceResults]
				.filter((result): result is PromiseRejectedResult => result.status === "rejected");
			if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Knowledge runtime disposal failed");
		})();
		return disposal;
	}
	return { config, host, extensionHost, ui, semantic, reviewPolicy, services, specialists, specialistTools, wiki, topics, delivery,
		assertActive, run, attachSession, dispose };
}

export type KnowledgeRuntime = ReturnType<typeof createKnowledgeRuntime>;
