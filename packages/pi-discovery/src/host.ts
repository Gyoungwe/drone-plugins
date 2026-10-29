import { isAbsolute } from "node:path";
import type { DiscoveryHostInput, DiscoveryHostPort } from "./ports.js";
import { DiscoveryService } from "./service.js";
export type * from "./ports.js";

function create(input: DiscoveryHostInput): DiscoveryHostPort {
	if (
		!input ||
		typeof input.projectId !== "string" ||
		typeof input.projectRoot !== "string" ||
		!isAbsolute(input.projectRoot)
	)
		throw new Error(
			"Discovery requires a project identity and absolute project root",
		);
	if (!input.services)
		throw new Error("Discovery requires host-owned services");
	const service = new DiscoveryService(input);
	return {
		contractVersion: 1,
		status: async () => ({
			contractVersion: 1,
			projectId: input.projectId,
			provider: "pi-discovery",
			readOnly: false,
			legacyJournal: await input.services.legacyJournal(),
		}),
		init: () => service.init(),
		dispose: () => service.dispose(),
		getCapabilities: (value) =>
			service.getCapabilities((value as { language: "python" | "r" }).language),
		listKernelSessions: () => service.listKernelSessions(),
		getKernelSession: (value) =>
			service.getKernelSession((value as { sessionId: string }).sessionId),
		createKernelSession: (value) =>
			service.createKernelSession(
				value as Parameters<DiscoveryService["createKernelSession"]>[0],
			),
		executeKernel: (value) => {
			const request = value as { sessionId: string; code: string };
			return service.executeKernel(request.sessionId, request.code);
		},
		exportKernel: (value) =>
			service.exportKernel((value as { sessionId: string }).sessionId),
		closeKernelSession: (value) =>
			service.closeKernelSession((value as { sessionId: string }).sessionId),
		recordDiscovery: (value) =>
			service.recordDiscovery(
				value as Parameters<DiscoveryService["recordDiscovery"]>[0],
			),
		listCriticReviews: () => service.listCriticReviews(),
		listMultipathAssessments: () => service.listMultipathAssessments(),
		listExplorationPlans: () => service.listExplorationPlans(),
		listEvaluations: () => service.listEvaluations(),
		createExplorationPlan: (value) =>
			service.createExplorationPlan(
				value as Parameters<DiscoveryService["createExplorationPlan"]>[0],
			),
		runCritic: (value) =>
			service.runCritic(value as Parameters<DiscoveryService["runCritic"]>[0]),
		runMultipath: (value) => {
			const { plan, executor } = value as {
				plan: Parameters<DiscoveryService["runMultipath"]>[0];
				executor: Parameters<DiscoveryService["runMultipath"]>[1];
			};
			return service.runMultipath(plan, executor);
		},
		runEvaluation: (value) => {
			const { cases, evaluator, options } = value as {
				cases: Parameters<DiscoveryService["runEvaluation"]>[0];
				evaluator: Parameters<DiscoveryService["runEvaluation"]>[1];
				options?: Parameters<DiscoveryService["runEvaluation"]>[2];
			};
			return service.runEvaluation(cases, evaluator, options);
		},
		listBaselines: () => service.listBaselines(),
		putBaseline: (value) =>
			service.putBaseline(
				value as Parameters<DiscoveryService["putBaseline"]>[0],
			),
	};
}
export const discoveryHostLoader = {
	contractVersion: 1 as const,
	create,
	load(): DiscoveryHostPort {
		throw new Error("Discovery requires host-owned services");
	},
};
