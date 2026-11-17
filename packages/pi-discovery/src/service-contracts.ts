import type {
	CriticRequest,
	DiscoveryEvaluationCase,
	DiscoveryEvaluationObservation,
	DiscoveryEvaluationRun,
	DiscoveryExplorationBudget,
	DiscoveryLedgerInput,
	KernelSession,
	MultipathPathExecutionResult,
	MultipathPlan,
	rankExplorationCandidates,
} from "./domain/index.js";
import type {
	DiscoveryAuthorizationOperation,
	DiscoveryHostServices,
	DiscoveryQuestionPrior as QuestionPrior,
} from "./ports.js";
import type {
	DiscoveryCapabilities,
	DiscoveryCriticReview,
	DiscoveryDataClassification,
	DiscoveryEvaluation,
	DiscoveryExplorationPlan,
	DiscoveryKernelLanguage,
	DiscoveryKernelSession,
	DiscoveryMultipathAssessment,
} from "./projections.js";

export type DiscoveryAuthorization = (operation: DiscoveryAuthorizationOperation) => Promise<void>;

export interface DiscoveryKernelSessionInput {
	readonly sessionId: string;
	readonly runDirectory: string;
	readonly language: DiscoveryKernelLanguage;
	readonly dataClassification: DiscoveryDataClassification;
	readonly idleTimeoutMs?: number;
	readonly executionTimeoutMs?: number;
	readonly maxExecutions?: number;
	readonly maxOutputBytes?: number;
}

export interface DiscoveryServiceOptions {
	readonly projectId: string;
	readonly projectRoot: string;
	readonly services: DiscoveryHostServices;
}

export interface DiscoveryServicePort {
	init(): Promise<void>;
	getCapabilities(language: DiscoveryKernelLanguage): Promise<DiscoveryCapabilities>;
	listKernelSessions(): Promise<readonly DiscoveryKernelSession[]>;
	getKernelSession(sessionId: string): Promise<DiscoveryKernelSession | null>;
	recordDiscovery(input: DiscoveryLedgerInput): Promise<void>;
	createKernelSession(input: DiscoveryKernelSessionInput): Promise<DiscoveryKernelSession>;
	executeKernel(
		sessionId: string,
		code: string,
	): Promise<ReturnType<KernelSession["execute"]> extends Promise<infer T> ? T : never>;
	exportKernel(sessionId: string): Promise<{
		readonly scriptPath: string;
		readonly notebookPath: string;
		readonly script: string;
		readonly notebook: string;
	}>;
	closeKernelSession(sessionId: string): Promise<void>;
	listCriticReviews(): Promise<readonly DiscoveryCriticReview[]>;
	listMultipathAssessments(): Promise<readonly DiscoveryMultipathAssessment[]>;
	listExplorationPlans(): Promise<readonly DiscoveryExplorationPlan[]>;
	listEvaluations(): Promise<readonly DiscoveryEvaluation[]>;
	createExplorationPlan(input: {
		readonly id: string;
		readonly hypothesisId: string;
		readonly prior: QuestionPrior;
		readonly budget: DiscoveryExplorationBudget;
		readonly candidates: readonly Parameters<typeof rankExplorationCandidates>[0][number][];
	}): Promise<DiscoveryExplorationPlan>;
	runCritic(request: CriticRequest): Promise<DiscoveryCriticReview>;
	runMultipath(
		plan: MultipathPlan,
		executor: (path: MultipathPlan["paths"][number]) => Promise<MultipathPathExecutionResult>,
	): Promise<DiscoveryMultipathAssessment>;
	runEvaluation(
		cases: readonly DiscoveryEvaluationCase[],
		evaluator: (item: DiscoveryEvaluationCase) => Promise<DiscoveryEvaluationObservation>,
		options?: { readonly runId?: string; readonly timeoutMs?: number },
	): Promise<DiscoveryEvaluationRun>;
}
