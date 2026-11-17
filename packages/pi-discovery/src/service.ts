import { isAbsolute, resolve } from "node:path";
import {
	type CriticRequest,
	createBaseline,
	createMultiPathPlan,
	type DiscoveryBaselineRecord,
	type DiscoveryEvaluationCase,
	type DiscoveryEvaluationObservation,
	type DiscoveryEvaluationRun,
	type DiscoveryExplorationBudget,
	type DiscoveryLedgerInput,
	ExplorationBudgetLedger,
	executeMultiPath,
	type KernelSession,
	type MultipathPathExecutionResult,
	type MultipathPlan,
	rankExplorationCandidates,
	recordCriticQuestions,
	recordDiscoveryToInquiry,
	runCriticReview,
	runEvaluation,
} from "./domain/index.js";
import type {
	DiscoveryAuthorizationOperation,
	DiscoveryJournal,
	DiscoveryQuestionPrior as QuestionPrior,
} from "./ports.js";
import type {
	DiscoveryCapabilities,
	DiscoveryCriticReview,
	DiscoveryEvaluation,
	DiscoveryExplorationPlan,
	DiscoveryKernelLanguage,
	DiscoveryKernelSession,
	DiscoveryMultipathAssessment,
} from "./projections.js";
import type {
	DiscoveryKernelSessionInput,
	DiscoveryServiceOptions,
	DiscoveryServicePort,
} from "./service-contracts.js";
import { DiscoveryKernelSessions, type PersistedSession, safeSessionId } from "./service-kernels.js";

export type {
	DiscoveryAuthorization,
	DiscoveryKernelSessionInput,
	DiscoveryServiceOptions,
	DiscoveryServicePort,
} from "./service-contracts.js";

interface PersistedCritic extends DiscoveryCriticReview {
	readonly recordedAt: string;
}
interface PersistedMultipath extends DiscoveryMultipathAssessment {
	readonly recordedAt: string;
}

function safeProjectId(value: string): string {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error("Invalid discovery project id");
	return value;
}
class FileBaselineStore {
	constructor(private readonly store: DiscoveryJournal<DiscoveryBaselineRecord>) {}
	async put(record: import("./domain/index.js").DiscoveryBaselineRecord): Promise<void> {
		const normalized = createBaseline(record);
		const records = (await this.store.read()) as import("./domain/index.js").DiscoveryBaselineRecord[];
		const index = records.findIndex(
			(item) =>
				item.metric === normalized.metric &&
				item.datasetId === normalized.datasetId &&
				item.datasetRevision === normalized.datasetRevision,
		);
		if (index >= 0) records[index] = normalized;
		else records.push(normalized);
		await this.store.write(records);
	}
	async get(
		metric: import("./domain/index.js").DiscoveryEvaluationMetric,
		datasetId: string,
		revision: string,
	): Promise<import("./domain/index.js").DiscoveryBaselineRecord | undefined> {
		return (await this.store.read()).find(
			(item: import("./domain/index.js").DiscoveryBaselineRecord) =>
				item.metric === metric && item.datasetId === datasetId && item.datasetRevision === revision,
		);
	}
	async list(): Promise<readonly import("./domain/index.js").DiscoveryBaselineRecord[]> {
		return await this.store.read();
	}
}

/** Backend composition-root service for B5d–B5f. */
export class DiscoveryService implements DiscoveryServicePort {
	readonly projectId: string;
	readonly projectRoot: string;
	private readonly options: DiscoveryServiceOptions;
	private readonly sessionsStore: DiscoveryJournal<PersistedSession>;
	private readonly criticsStore: DiscoveryJournal<PersistedCritic>;
	private readonly multipathStore: DiscoveryJournal<PersistedMultipath>;
	private readonly plansStore: DiscoveryJournal<DiscoveryExplorationPlan>;
	private readonly evaluationsStore: DiscoveryJournal<DiscoveryEvaluation>;
	private readonly baselineStore: FileBaselineStore;
	private readonly sessionMeta = new Map<string, PersistedSession>();
	private readonly critics: PersistedCritic[] = [];
	private readonly multipaths: PersistedMultipath[] = [];
	private readonly plans: DiscoveryExplorationPlan[] = [];
	private readonly evaluations: DiscoveryEvaluation[] = [];
	private initialized?: Promise<void>;
	private disposed = false;
	private disposal?: Promise<void>;
	private readonly kernels: DiscoveryKernelSessions;

	constructor(options: DiscoveryServiceOptions) {
		this.projectId = safeProjectId(options.projectId);
		if (!isAbsolute(options.projectRoot)) throw new Error("discovery projectRoot must be absolute");
		this.projectRoot = resolve(options.projectRoot);
		this.options = options;
		this.sessionsStore = options.services.journal<PersistedSession>("sessions");
		this.criticsStore = options.services.journal<PersistedCritic>("critics");
		this.multipathStore = options.services.journal<PersistedMultipath>("multipath");
		this.plansStore = options.services.journal<DiscoveryExplorationPlan>("plans");
		this.evaluationsStore = options.services.journal<DiscoveryEvaluation>("evaluations");
		this.baselineStore = new FileBaselineStore(
			options.services.journal<DiscoveryBaselineRecord>("baselines"),
		);
		this.kernels = new DiscoveryKernelSessions(
			this.projectId,
			this.projectRoot,
			options,
			this.sessionsStore,
			this.sessionMeta,
			() => this.init(),
			() => this.disposed,
		);
	}

	async init(): Promise<void> {
		if (this.disposed) throw new Error("discovery service is disposed");
		if (this.initialized) return this.initialized;
		this.initialized = (async () => {
			if (this.disposed) throw new Error("discovery service is disposed");
			const [sessions, critics, multipaths, plans, evaluations] = await Promise.all([
				this.sessionsStore.read(),
				this.criticsStore.read(),
				this.multipathStore.read(),
				this.plansStore.read(),
				this.evaluationsStore.read(),
			]);
			for (const session of sessions) {
				try {
					if (safeSessionId(session.sessionId) && session.runDirectory.startsWith("runs/"))
						this.sessionMeta.set(session.sessionId, session);
				} catch (error) {
					console.warn("Ignored invalid discovery session journal entry", error);
				}
			}
			this.critics.splice(0, this.critics.length, ...critics);
			this.multipaths.splice(0, this.multipaths.length, ...multipaths);
			this.plans.splice(0, this.plans.length, ...plans);
			this.evaluations.splice(0, this.evaluations.length, ...evaluations);
		})();
		return this.initialized;
	}

	private async authorize(operation: DiscoveryAuthorizationOperation): Promise<void> {
		await this.options.services.authorize(operation);
	}
	async getCapabilities(language: DiscoveryKernelLanguage): Promise<DiscoveryCapabilities> {
		return this.kernels.getCapabilities(language);
	}
	/** Called only by an explicit legitimate runtime reconcile operation, never by dispose. */
	async persistObservedKernelStates(): Promise<void> {
		return this.kernels.persistObservedKernelStates();
	}

	async listKernelSessions(): Promise<readonly DiscoveryKernelSession[]> {
		return this.kernels.listKernelSessions();
	}
	async getKernelSession(sessionId: string): Promise<DiscoveryKernelSession | null> {
		return this.kernels.getKernelSession(sessionId);
	}
	async recordDiscovery(input: DiscoveryLedgerInput): Promise<void> {
		await this.init();
		if (!this.options.services.inquiry) throw new Error("inquiry ledger is not configured");
		if (input.projectId !== this.projectId)
			throw new Error("discovery project does not match inquiry project");
		await recordDiscoveryToInquiry(this.options.services.inquiry, input);
	}
	createKernelSession(input: DiscoveryKernelSessionInput): Promise<DiscoveryKernelSession> {
		return this.kernels.createKernelSession(input);
	}
	async executeKernel(
		sessionId: string,
		code: string,
		signal?: AbortSignal,
	): Promise<Awaited<ReturnType<KernelSession["execute"]>>> {
		return this.kernels.executeKernel(sessionId, code, signal);
	}
	async exportKernel(sessionId: string) {
		return this.kernels.exportKernel(sessionId);
	}
	/** Resource-only shutdown: no capability, caller replacement or journal write is borrowed. */
	async disposeKernelSession(sessionId: string): Promise<void> {
		return this.kernels.disposeKernelSession(sessionId);
	}
	async closeKernelSession(sessionId: string): Promise<void> {
		return this.kernels.closeKernelSession(sessionId);
	}

	async createExplorationPlan(input: {
		readonly id: string;
		readonly hypothesisId: string;
		readonly prior: QuestionPrior;
		readonly budget: DiscoveryExplorationBudget;
		readonly candidates: readonly Parameters<typeof rankExplorationCandidates>[0][number][];
	}): Promise<DiscoveryExplorationPlan> {
		await this.init();
		const ledger = new ExplorationBudgetLedger(input.budget);
		void ledger;
		const ranked = rankExplorationCandidates(input.candidates);
		const plan: DiscoveryExplorationPlan = {
			id: input.id,
			projectId: this.projectId,
			hypothesisId: input.hypothesisId,
			prior: input.prior,
			budget: input.budget,
			rankedCandidateIds: ranked.map((candidate) => candidate.id),
			createdAt: new Date().toISOString(),
		};
		await this.plansStore.write([...this.plans, plan]);
		this.plans.push(plan);
		return plan;
	}
	async listExplorationPlans(): Promise<readonly DiscoveryExplorationPlan[]> {
		await this.init();
		return [...this.plans];
	}
	async runCritic(request: CriticRequest): Promise<DiscoveryCriticReview> {
		await this.init();
		const result = await runCriticReview(request, this.options.services.criticProvider);
		const review: PersistedCritic = {
			findingId: request.findingId,
			...result,
			questions: result.questions.map((question) => ({
				...question,
				evidenceArtifactIds: [...question.evidenceArtifactIds],
			})),
			recordedAt: new Date().toISOString(),
		};
		this.critics.push(review);
		await this.criticsStore.write(this.critics);
		if (this.options.services.inquiry && result.questions.length)
			await recordCriticQuestions(this.options.services.inquiry, {
				projectId: this.projectId,
				findingId: request.findingId,
				questions: result.questions,
			});
		return review;
	}
	async listCriticReviews(): Promise<readonly DiscoveryCriticReview[]> {
		await this.init();
		return this.critics.map(({ recordedAt: _recordedAt, ...review }) => review);
	}
	async runMultipath(
		plan: MultipathPlan,
		executor: (path: MultipathPlan["paths"][number]) => Promise<MultipathPathExecutionResult>,
	): Promise<DiscoveryMultipathAssessment> {
		await this.init();
		await this.authorize({
			kind: "multipath-execution",
			projectId: this.projectId,
			planId: plan.id,
		});
		const assessment = await executeMultiPath(createMultiPathPlan(plan), executor, {
			projectId: this.projectId,
			inquiry: this.options.services.inquiry,
		});
		const record: PersistedMultipath = {
			planId: plan.id,
			findingId: plan.findingId,
			grade: assessment.grade,
			intent: assessment.label,
			attemptCount: assessment.attemptCount,
			consistentCount: assessment.consistentCount,
			consistency: assessment.consistency,
			recordedAt: new Date().toISOString(),
		};
		this.multipaths.push(record);
		await this.multipathStore.write(this.multipaths);
		return record;
	}
	async listMultipathAssessments(): Promise<readonly DiscoveryMultipathAssessment[]> {
		await this.init();
		return this.multipaths.map(({ recordedAt: _recordedAt, ...value }) => value);
	}
	async runEvaluation(
		cases: readonly DiscoveryEvaluationCase[],
		evaluator: (item: DiscoveryEvaluationCase) => Promise<DiscoveryEvaluationObservation>,
		options: { readonly runId?: string; readonly timeoutMs?: number } = {},
	): Promise<DiscoveryEvaluationRun> {
		await this.init();
		const runId = options.runId ?? `evaluation-${Date.now()}`;
		await this.authorize({
			kind: "evaluation-execution",
			projectId: this.projectId,
			runId,
		});
		const result = await runEvaluation(cases, evaluator, this.baselineStore, {
			...options,
			runId,
		});
		const projection: DiscoveryEvaluation = {
			runId: result.runId,
			status: result.status,
			startedAt: result.startedAt,
			finishedAt: result.finishedAt,
			missingData: [...result.missingData],
			blockedCases: [...result.blockedCases],
			metrics: result.metrics.map((metric) => ({
				metric: metric.metric,
				value: metric.value,
				...(metric.baseline === undefined ? {} : { baseline: metric.baseline }),
				...(metric.delta === undefined ? {} : { delta: metric.delta }),
				passed: metric.passed,
				baselineAvailable: metric.baselineAvailable,
				caseIds: [...metric.caseIds],
			})),
		};
		this.evaluations.push(projection);
		await this.evaluationsStore.write(this.evaluations);
		return result;
	}
	async listEvaluations(): Promise<readonly DiscoveryEvaluation[]> {
		await this.init();
		return [...this.evaluations];
	}
	async listBaselines(): Promise<readonly DiscoveryBaselineRecord[]> {
		await this.init();
		return this.baselineStore.list();
	}
	async putBaseline(record: DiscoveryBaselineRecord): Promise<void> {
		await this.init();
		await this.baselineStore.put(record);
	}
	dispose(): Promise<void> {
		if (this.disposal) return this.disposal;
		this.disposed = true;
		this.disposal = this.kernels.disposeSessions();
		return this.disposal;
	}
}
