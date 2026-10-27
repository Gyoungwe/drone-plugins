import type {
	DiscoveryClassification,
	DiscoveryLanguage,
	DiscoveryRunnerCapabilities,
	DiscoveryQuestionPrior,
} from "./ports.js";
import type {
	CriticReviewResult,
	MultipathAssessment,
} from "./domain/critic.js";
import type { DiscoveryExplorationBudget } from "./domain/exploration.js";
import type { DiscoveryEvaluationRun } from "./domain/evaluation.js";
export type DiscoveryCapabilities = DiscoveryRunnerCapabilities;
export type DiscoveryDataClassification = DiscoveryClassification;
export type DiscoveryKernelLanguage = DiscoveryLanguage;
export interface DiscoveryKernelSession {
	readonly sessionId: string;
	readonly language: DiscoveryLanguage;
	readonly dataClassification: DiscoveryClassification;
	readonly runDirectory: string;
	readonly status:
		| "ready"
		| "running"
		| "closed"
		| "idle-timeout"
		| "needs-container";
	readonly executionCount: number;
	readonly remainingExecutions: number;
	readonly expiresAt?: string;
	readonly capabilities: DiscoveryCapabilities;
}
export interface DiscoveryCriticReview extends CriticReviewResult {
	readonly findingId: string;
}
export interface DiscoveryMultipathAssessment {
	readonly planId: string;
	readonly findingId: string;
	readonly grade: MultipathAssessment["grade"];
	readonly intent: MultipathAssessment["label"];
	readonly attemptCount: number;
	readonly consistentCount: number;
	readonly consistency: number;
}
export interface DiscoveryExplorationPlan {
	readonly id: string;
	readonly projectId: string;
	readonly hypothesisId: string;
	readonly prior: DiscoveryQuestionPrior;
	readonly budget: DiscoveryExplorationBudget;
	readonly rankedCandidateIds: readonly string[];
	readonly createdAt: string;
}
export type DiscoveryEvaluation = Omit<DiscoveryEvaluationRun, "observations">;
