import type { KnowledgeExtensionHost } from "@gyoungwe/plugin-api/knowledge";
import type { KnowledgeConfigApi } from "./config.js";
import type { KnowledgeRuntimeHost } from "./runtime-host.js";
import { createKnowledgeUi } from "./ui-state.js";
import { createSemanticSettingsApi } from "./semantic-settings.js";
import { createKnowledgeReviewPolicy } from "./review-policy.js";
import { createKnowledgeServicePool } from "./service.js";
import { createKnowledgeWorkerTransportFactory } from "./worker-transport.js";
import { createKnowledgeSpecialistHost } from "./specialist-host.js";
import { createKnowledgeSpecialistTools } from "./specialists.js";
import { createKnowledgeWikiReview } from "./wiki-review.js";
import { createLocalWikiReviewPorts } from "./wiki-review-node.js";
import { createTopicMemoryApi } from "./topic-memory.js";
import { createSpecialistDelivery } from "./specialist-delivery.js";
import { acquireKnowledgeWriterLease } from "./writer-lease.js";
import { createKnowledgeWriterLeaseGroup } from "./writer-lease-group.js";
import { createKnowledgeOwnerLifecycle } from "./owner-lifecycle.js";

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
	const writerReservations = createKnowledgeWriterLeaseGroup(acquireWriterLease);
	const services = createKnowledgeServicePool(
		host,
		config,
		semantic,
		reviewPolicy,
		createKnowledgeWorkerTransportFactory(
			host,
			config,
			ui.invalidateKnowledgeUi,
			writerReservations.acquireWorker,
		),
	);
	const specialists = createKnowledgeSpecialistHost(host, config, ui);
	const specialistTools = createKnowledgeSpecialistTools(host, config, specialists, ui);
	const wiki = createKnowledgeWikiReview(host, config, reviewPolicy, ui, createLocalWikiReviewPorts(config));
	const topics = createTopicMemoryApi(host, config);
	const delivery = createSpecialistDelivery(host, config);
	const lifecycle = createKnowledgeOwnerLifecycle({
		beforeDrain: () => specialists.dispose(),
		async dispose() {
			const serviceResults = await Promise.allSettled([services.dispose()]);
			const reservationResults = await Promise.allSettled([
				Promise.resolve().then(() => writerReservations.dispose()),
			]);
			ui.dispose();
			const failures = [...serviceResults, ...reservationResults].filter(
				(result): result is PromiseRejectedResult => result.status === "rejected",
			);
			if (failures.length)
				throw new AggregateError(
					failures.map((result) => result.reason),
					"Knowledge resources could not be disposed",
				);
		},
	});
	return {
		config,
		host,
		extensionHost,
		ui,
		semantic,
		reviewPolicy,
		services,
		specialists,
		specialistTools,
		wiki,
		topics,
		delivery,
		...lifecycle,
	};
}

export type KnowledgeRuntime = ReturnType<typeof createKnowledgeRuntime>;
