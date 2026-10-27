/** Dependency-free execution and persistence services owned by the host. */
export interface DiscoveryRunProvenanceSummary {
	readonly containerDigests?: readonly string[];
	readonly workflow?: string;
	readonly modules?: readonly string[];
	readonly commandSummary?: string;
	readonly environment?: Readonly<Record<string, string>>;
}

export type DiscoveryFindingLabel = "exploratory" | "confirmatory";
export type DiscoveryFindingReviewStatus =
	| "unreviewed"
	| "reviewed"
	| "rejected";
export type DiscoveryRobustnessGrade =
	| "robust"
	| "sensitive"
	| "unstable"
	| "unknown";

export interface DiscoveryFindingValue {
	readonly metric: string;
	readonly value: number | string | boolean;
	readonly unit?: string;
	readonly confidenceInterval?: readonly [number, number];
}

export interface DiscoveryFindingRobustness {
	readonly attemptCount: number;
	readonly consistentCount: number;
	readonly grade: DiscoveryRobustnessGrade;
}

export interface DiscoveryFindingRecord {
	readonly id: string;
	readonly schemaVersion: 1 | 2;
	readonly projectId: string;
	readonly statement: string;
	readonly values: readonly DiscoveryFindingValue[];
	readonly conditions: readonly string[];
	readonly artifactIds: readonly string[];
	readonly codeFingerprint?: string;
	readonly label: DiscoveryFindingLabel;
	readonly robustness: DiscoveryFindingRobustness;
	readonly hypothesisIds: readonly string[];
	readonly reviewStatus: DiscoveryFindingReviewStatus;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type DiscoveryQuestionKind = "question" | "hypothesis" | "anomaly";
export type DiscoveryQuestionStatus =
	| "open"
	| "supported"
	| "refuted"
	| "deferred";
export type DiscoveryQuestionProposer = "user" | "agent";
export type DiscoveryPriorDirection =
	| "positive"
	| "negative"
	| "none"
	| "unknown";

export interface DiscoveryQuestionPrior {
	readonly direction: DiscoveryPriorDirection;
	readonly magnitude?: number;
	readonly confidence?: number;
	readonly recordedAt: string;
}

export interface DiscoveryQuestionPosterior {
	readonly direction?: DiscoveryPriorDirection;
	readonly magnitude?: number;
	readonly confidence?: number;
	readonly recordedAt: string;
}

export interface DiscoveryQuestionRecord {
	readonly id: string;
	readonly schemaVersion: 1 | 2;
	readonly projectId: string;
	readonly kind: DiscoveryQuestionKind;
	readonly statement: string;
	readonly prior?: DiscoveryQuestionPrior;
	readonly posterior?: DiscoveryQuestionPosterior;
	readonly surprise?: number;
	readonly competingExplanations: readonly string[];
	readonly testsDone: readonly string[];
	readonly testsPlanned: readonly string[];
	readonly status: DiscoveryQuestionStatus;
	readonly proposer: DiscoveryQuestionProposer;
	readonly priority: number;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type DiscoveryAttemptOutcome =
	| "running"
	| "succeeded"
	| "failed"
	| "blocked"
	| "unknown";

export interface DiscoveryAttemptRecord {
	readonly id: string;
	readonly schemaVersion: 1 | 2;
	readonly projectId: string;
	readonly hypothesisIds: readonly string[];
	readonly codeFingerprint?: string;
	readonly parameters: Readonly<
		Record<string, string | number | boolean | null>
	>;
	readonly artifactIds: readonly string[];
	readonly resultSummary?: string;
	readonly sessionId?: string;
	readonly turn?: number;
	readonly runProvenance?: DiscoveryRunProvenanceSummary;
	readonly outcome: DiscoveryAttemptOutcome;
	readonly enteredReport: boolean;
	readonly startedAt: string;
	readonly finishedAt?: string;
}

export type DiscoveryLanguage = "python" | "r";
export type DiscoveryClassification =
	| "public"
	| "internal"
	| "controlled"
	| "restricted";
export interface DiscoveryRunnerCapabilities {
	readonly kind: "container" | "fixture" | "unavailable";
	readonly languages: readonly DiscoveryLanguage[];
	readonly networkDisabled: boolean;
	readonly writesOnlyToRunDirectory: boolean;
}
export interface DiscoveryRunRequest {
	readonly requestId: string;
	readonly language: DiscoveryLanguage;
	readonly code: string;
	readonly runDirectory: string;
	readonly timeoutMs: number;
	readonly maxOutputBytes: number;
	readonly dataClassification: DiscoveryClassification;
}
export interface DiscoveryRunResult {
	readonly exitCode: number;
	readonly durationMs: number;
	readonly producedBytes: number;
	readonly outputs: readonly {
		readonly text: string;
		readonly contentKind: "summary" | "plot" | "table" | "raw";
		readonly classification: DiscoveryClassification;
	}[];
}
export interface DiscoveryRunner {
	readonly capabilities: DiscoveryRunnerCapabilities;
	run(request: DiscoveryRunRequest): Promise<DiscoveryRunResult>;
}
export interface DiscoveryKernelExecution {
	readonly id: string;
	readonly code: string;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly status: "succeeded" | "failed" | "blocked";
	readonly exitCode?: number;
	readonly output: string;
	readonly outputClassification: DiscoveryClassification;
	readonly contentKinds: readonly ("summary" | "plot" | "table" | "raw")[];
	readonly producedBytes: number;
	readonly redactedBytes: number;
	readonly blockedReason?: string;
}
export type DiscoveryAuthorizationOperation =
	| { readonly kind: "create-kernel-session"; readonly projectId: string }
	| {
			readonly kind:
				| "execute-kernel"
				| "export-kernel"
				| "close-kernel-session";
			readonly projectId: string;
			readonly sessionId: string;
	  }
	| {
			readonly kind: "multipath-execution";
			readonly projectId: string;
			readonly planId: string;
	  }
	| {
			readonly kind: "evaluation-execution";
			readonly projectId: string;
			readonly runId: string;
	  };
export type DiscoveryJournalName =
	| "sessions"
	| "critics"
	| "multipath"
	| "plans"
	| "evaluations"
	| "baselines";
export interface DiscoveryJournal<T> {
	read(): Promise<T[]>;
	write(records: T[]): Promise<void>;
}
export interface DiscoveryInquiryPort {
	recordQuestion(record: DiscoveryQuestionRecord): Promise<void>;
	recordAttempt(record: DiscoveryAttemptRecord): Promise<void>;
	recordFinding?(record: DiscoveryFindingRecord): Promise<void>;
}
export interface DiscoveryExecutionReceipt {
	readonly sessionId: string;
	readonly projectId: string;
	readonly cwd: string;
	readonly runDirectory: string;
	readonly language: string;
	readonly code: string;
	readonly execution: DiscoveryKernelExecution;
}
export type DiscoveryCriticChecklistItem =
	| "confounding"
	| "batch-effect"
	| "multiple-testing"
	| "data-leakage"
	| "circular-analysis"
	| "overclaiming";
export interface DiscoveryCriticProvider {
	readonly providerId: string;
	review(input: {
		readonly findingId: string;
		readonly findingStatement: string;
		readonly artifactIds: readonly string[];
		readonly primaryProviderId: string;
		readonly checklist?: readonly DiscoveryCriticChecklistItem[];
		readonly role: {
			readonly id: "critic";
			readonly readOnly: true;
			readonly canWrite: false;
			readonly canShell: false;
			readonly canNetwork: false;
			readonly canDelegate: false;
			readonly checklist: readonly DiscoveryCriticChecklistItem[];
		};
	}): Promise<
		readonly {
			readonly checklistItem: DiscoveryCriticChecklistItem;
			readonly question: string;
			readonly severity: "high" | "medium" | "low";
			readonly evidenceArtifactIds: readonly string[];
		}[]
	>;
}
export interface DiscoveryHostServices {
	journal<T>(name: DiscoveryJournalName): DiscoveryJournal<T>;
	authorize(operation: DiscoveryAuthorizationOperation): Promise<void>;
	runner(language: DiscoveryLanguage): Promise<DiscoveryRunner>;
	readonly files: {
		prepareDirectory(path: string): Promise<void>;
		write(path: string, content: string, mediaType: string): Promise<void>;
	};
	readonly inquiry?: DiscoveryInquiryPort;
	readonly criticProvider?: DiscoveryCriticProvider;
	onExecution(receipt: DiscoveryExecutionReceipt): void | Promise<void>;
	legacyJournal(): Promise<
		{ readonly status: "unassigned"; readonly path: string } | undefined
	>;
}
export interface DiscoveryHostInput {
	readonly projectId: string;
	readonly projectRoot: string;
	readonly agentDir?: string;
	readonly services: DiscoveryHostServices;
}
export interface DiscoveryHostPort {
	readonly contractVersion: 1;
	status?(input: unknown): Promise<unknown>;
	init?(): Promise<void>;
	dispose?(): void | Promise<void>;
	getCapabilities?(input: unknown): Promise<unknown>;
	getKernelSession?(input: unknown): Promise<unknown>;
	recordDiscovery?(input: unknown): Promise<unknown>;
	listKernelSessions?(input: unknown): Promise<unknown>;
	createKernelSession?(input: unknown): Promise<unknown>;
	executeKernel?(input: unknown): Promise<unknown>;
	exportKernel?(input: unknown): Promise<unknown>;
	closeKernelSession?(input: unknown): Promise<unknown>;
	listCriticReviews?(input: unknown): Promise<unknown>;
	listMultipathAssessments?(input: unknown): Promise<unknown>;
	listExplorationPlans?(input: unknown): Promise<unknown>;
	listEvaluations?(input: unknown): Promise<unknown>;
	createExplorationPlan?(input: unknown): Promise<unknown>;
	runCritic?(input: unknown): Promise<unknown>;
	runMultipath?(input: unknown): Promise<unknown>;
	runEvaluation?(input: unknown): Promise<unknown>;
	listBaselines?(input: unknown): Promise<unknown>;
	putBaseline?(input: unknown): Promise<unknown>;
}
export interface DiscoveryHostLoader {
	readonly contractVersion: 1;
	load(): DiscoveryHostPort;
	create?(input: DiscoveryHostInput): DiscoveryHostPort;
}
