import { isAbsolute, relative, resolve } from "node:path";
import type { InquiryDiscoveryPort } from "./domain/index.js";
import {
	type ControlledKernelRunner,
	type CriticProvider,
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
	type KernelLanguage,
	type KernelRunnerCapabilities,
	KernelSession,
	type KernelSessionOptions,
	type MultipathPathExecutionResult,
	type MultipathPlan,
	rankExplorationCandidates,
	recordCriticQuestions,
	recordDiscoveryToInquiry,
	runCriticReview,
	runEvaluation,
	UnavailableKernelRunner,
} from "./domain/index.js";
import type { DiscoveryQuestionPrior as QuestionPrior } from "./ports.js";
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
import type {
	DiscoveryHostServices,
	DiscoveryJournal,
	DiscoveryAuthorizationOperation,
} from "./ports.js";

export type DiscoveryAuthorization = (
	operation: DiscoveryAuthorizationOperation,
) => Promise<void>;

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

interface PersistedSession {
	readonly sessionId: string;
	readonly runDirectory: string;
	readonly language: DiscoveryKernelLanguage;
	readonly dataClassification: DiscoveryDataClassification;
	readonly status: DiscoveryKernelSession["status"];
	readonly executionCount: number;
	readonly capabilities: KernelRunnerCapabilities;
	readonly createdAt: string;
}
interface PersistedCritic extends DiscoveryCriticReview {
	readonly recordedAt: string;
}
interface PersistedMultipath extends DiscoveryMultipathAssessment {
	readonly recordedAt: string;
}

export interface DiscoveryServicePort {
	init(): Promise<void>;
	getCapabilities(
		language: DiscoveryKernelLanguage,
	): Promise<DiscoveryCapabilities>;
	listKernelSessions(): Promise<readonly DiscoveryKernelSession[]>;
	getKernelSession(sessionId: string): Promise<DiscoveryKernelSession | null>;
	recordDiscovery(input: DiscoveryLedgerInput): Promise<void>;
	createKernelSession(
		input: DiscoveryKernelSessionInput,
	): Promise<DiscoveryKernelSession>;
	executeKernel(
		sessionId: string,
		code: string,
	): Promise<
		ReturnType<KernelSession["execute"]> extends Promise<infer T> ? T : never
	>;
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
		readonly candidates: readonly Parameters<
			typeof rankExplorationCandidates
		>[0][number][];
	}): Promise<DiscoveryExplorationPlan>;
	runCritic(request: CriticRequest): Promise<DiscoveryCriticReview>;
	runMultipath(
		plan: MultipathPlan,
		executor: (
			path: MultipathPlan["paths"][number],
		) => Promise<MultipathPathExecutionResult>,
	): Promise<DiscoveryMultipathAssessment>;
	runEvaluation(
		cases: readonly DiscoveryEvaluationCase[],
		evaluator: (
			item: DiscoveryEvaluationCase,
		) => Promise<DiscoveryEvaluationObservation>,
		options?: { readonly runId?: string; readonly timeoutMs?: number },
	): Promise<DiscoveryEvaluationRun>;
}

function safeProjectId(value: string): string {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
		throw new Error("Invalid discovery project id");
	return value;
}
function safeSessionId(value: string): string {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
		throw new Error("Invalid discovery session id");
	return value;
}
function safeRunDirectory(projectRoot: string, value: string): string {
	if (isAbsolute(value) || value.includes("\u0000"))
		throw new Error("Discovery run directory must be relative");
	const normalized = value.replaceAll("\\", "/");
	const candidate = resolve(projectRoot, normalized);
	const rel = relative(resolve(projectRoot), candidate).replaceAll("\\", "/");
	if (!rel.startsWith("runs/") || rel.includes("../") || rel === "runs")
		throw new Error("Discovery runs are restricted to project runs");
	return normalized;
}
function toCapabilities(
	value: KernelRunnerCapabilities,
): DiscoveryCapabilities {
	return {
		kind: value.kind,
		languages: [...value.languages],
		networkDisabled: value.networkDisabled,
		writesOnlyToRunDirectory: value.writesOnlyToRunDirectory,
	};
}
class FileBaselineStore {
	constructor(
		private readonly store: DiscoveryJournal<DiscoveryBaselineRecord>,
	) {}
	async put(
		record: import("./domain/index.js").DiscoveryBaselineRecord,
	): Promise<void> {
		const normalized = createBaseline(record);
		const records =
			(await this.store.read()) as import("./domain/index.js").DiscoveryBaselineRecord[];
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
				item.metric === metric &&
				item.datasetId === datasetId &&
				item.datasetRevision === revision,
		);
	}
	async list(): Promise<
		readonly import("./domain/index.js").DiscoveryBaselineRecord[]
	> {
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
	private readonly sessions = new Map<string, KernelSession>();
	private readonly sessionMeta = new Map<string, PersistedSession>();
	private readonly critics: PersistedCritic[] = [];
	private readonly multipaths: PersistedMultipath[] = [];
	private readonly plans: DiscoveryExplorationPlan[] = [];
	private readonly evaluations: DiscoveryEvaluation[] = [];
	private initialized?: Promise<void>;
	private disposed = false;
	private readonly executions = new Map<
		string,
		Promise<Awaited<ReturnType<KernelSession["execute"]>>>
	>();
	private disposal?: Promise<void>;

	constructor(options: DiscoveryServiceOptions) {
		this.projectId = safeProjectId(options.projectId);
		if (!isAbsolute(options.projectRoot))
			throw new Error("discovery projectRoot must be absolute");
		this.projectRoot = resolve(options.projectRoot);
		this.options = options;
		this.sessionsStore = options.services.journal<PersistedSession>("sessions");
		this.criticsStore = options.services.journal<PersistedCritic>("critics");
		this.multipathStore =
			options.services.journal<PersistedMultipath>("multipath");
		this.plansStore =
			options.services.journal<DiscoveryExplorationPlan>("plans");
		this.evaluationsStore =
			options.services.journal<DiscoveryEvaluation>("evaluations");
		this.baselineStore = new FileBaselineStore(
			options.services.journal<DiscoveryBaselineRecord>("baselines"),
		);
	}

	async init(): Promise<void> {
		if (this.disposed) throw new Error("discovery service is disposed");
		if (this.initialized) return this.initialized;
		this.initialized = (async () => {
			if (this.disposed) throw new Error("discovery service is disposed");
			const [sessions, critics, multipaths, plans, evaluations] =
				await Promise.all([
					this.sessionsStore.read(),
					this.criticsStore.read(),
					this.multipathStore.read(),
					this.plansStore.read(),
					this.evaluationsStore.read(),
				]);
			for (const session of sessions) {
				try {
					if (
						safeSessionId(session.sessionId) &&
						session.runDirectory.startsWith("runs/")
					)
						this.sessionMeta.set(session.sessionId, session);
				} catch (error) {
					console.warn(
						"Ignored invalid discovery session journal entry",
						error,
					);
				}
			}
			this.critics.splice(0, this.critics.length, ...critics);
			this.multipaths.splice(0, this.multipaths.length, ...multipaths);
			this.plans.splice(0, this.plans.length, ...plans);
			this.evaluations.splice(0, this.evaluations.length, ...evaluations);
		})();
		return this.initialized;
	}

	private async authorize(
		operation: DiscoveryAuthorizationOperation,
	): Promise<void> {
		await this.options.services.authorize(operation);
	}
	private runnerFor(language: KernelLanguage): Promise<ControlledKernelRunner> {
		return this.options.services.runner(language);
	}

	async getCapabilities(
		language: DiscoveryKernelLanguage,
	): Promise<DiscoveryCapabilities> {
		const runner = await this.runnerFor(language);
		return toCapabilities(runner.capabilities);
	}

	private async persistSessions(): Promise<void> {
		await this.sessionsStore.write([...this.sessionMeta.values()]);
	}
	private sessionProjection(id: string): DiscoveryKernelSession | null {
		const session = this.sessions.get(id);
		const meta = this.sessionMeta.get(id);
		if (!meta) return null;
		if (!session)
			return {
				sessionId: meta.sessionId,
				language: meta.language,
				dataClassification: meta.dataClassification,
				runDirectory: meta.runDirectory,
				status: meta.status,
				executionCount: meta.executionCount,
				remainingExecutions: 0,
				capabilities: toCapabilities(meta.capabilities),
			};
		const status = session.status;
		return {
			sessionId: id,
			language: meta.language,
			dataClassification: meta.dataClassification,
			runDirectory: meta.runDirectory,
			status: status.status,
			executionCount: status.executionCount,
			remainingExecutions: status.remainingExecutions,
			...(status.expiresAt ? { expiresAt: status.expiresAt } : {}),
			capabilities: toCapabilities(meta.capabilities),
		};
	}

	async listKernelSessions(): Promise<readonly DiscoveryKernelSession[]> {
		await this.init();
		return [...this.sessionMeta.keys()]
			.map((id) => this.sessionProjection(id))
			.filter((value): value is DiscoveryKernelSession => value !== null);
	}
	async getKernelSession(
		sessionId: string,
	): Promise<DiscoveryKernelSession | null> {
		await this.init();
		return this.sessionProjection(safeSessionId(sessionId));
	}
	async recordDiscovery(input: DiscoveryLedgerInput): Promise<void> {
		await this.init();
		if (!this.options.services.inquiry)
			throw new Error("inquiry ledger is not configured");
		if (input.projectId !== this.projectId)
			throw new Error("discovery project does not match inquiry project");
		await recordDiscoveryToInquiry(this.options.services.inquiry, input);
	}
	async createKernelSession(
		input: DiscoveryKernelSessionInput,
	): Promise<DiscoveryKernelSession> {
		await this.init();
		const sessionId = safeSessionId(input.sessionId);
		if (this.sessionMeta.has(sessionId))
			throw new Error(`Discovery session already exists: ${sessionId}`);
		const runDirectory = safeRunDirectory(this.projectRoot, input.runDirectory);
		await this.authorize({
			kind: "create-kernel-session",
			projectId: this.projectId,
		});
		await this.options.services.files.prepareDirectory(runDirectory);
		const runner = await this.runnerFor(input.language);
		if (this.disposed) throw new Error("discovery service is disposed");
		const options: KernelSessionOptions = {
			sessionId,
			runDirectory,
			language: input.language,
			dataClassification: input.dataClassification,
			runner,
			writer: this.options.services.files,
			...(input.idleTimeoutMs === undefined
				? {}
				: { idleTimeoutMs: input.idleTimeoutMs }),
			...(input.executionTimeoutMs === undefined
				? {}
				: { executionTimeoutMs: input.executionTimeoutMs }),
			...(input.maxExecutions === undefined
				? {}
				: { maxExecutions: input.maxExecutions }),
			...(input.maxOutputBytes === undefined
				? {}
				: { maxOutputBytes: input.maxOutputBytes }),
		};
		const session = new KernelSession(options);
		this.sessions.set(sessionId, session);
		this.sessionMeta.set(sessionId, {
			sessionId,
			runDirectory,
			language: input.language,
			dataClassification: input.dataClassification,
			status: session.status.status,
			executionCount: session.status.executionCount,
			capabilities: runner.capabilities,
			createdAt: new Date().toISOString(),
		});
		await this.persistSessions();
		return this.sessionProjection(sessionId) as DiscoveryKernelSession;
	}
	async executeKernel(
		sessionId: string,
		code: string,
	): Promise<Awaited<ReturnType<KernelSession["execute"]>>> {
		await this.init();
		const id = safeSessionId(sessionId);
		const session = this.sessions.get(id);
		if (!session)
			throw new Error(
				"Discovery kernel session is not active; create a new session",
			);
		await this.authorize({
			kind: "execute-kernel",
			projectId: this.projectId,
			sessionId: id,
		});
		if (this.disposed) throw new Error("discovery service is disposed");
		if (this.executions.has(id))
			throw new Error("discovery kernel execution is already running");
		const pending = this.executeSession(id, code, session);
		this.executions.set(id, pending);
		try {
			return await pending;
		} finally {
			if (this.executions.get(id) === pending) this.executions.delete(id);
		}
	}

	private async executeSession(
		id: string,
		code: string,
		session: KernelSession,
	): Promise<Awaited<ReturnType<KernelSession["execute"]>>> {
		const execution = await session.execute(code);
		const meta = this.sessionMeta.get(id);
		if (meta)
			this.sessionMeta.set(id, {
				...meta,
				status: session.status.status,
				executionCount: session.status.executionCount,
			});
		await this.persistSessions();
		await this.options.services.onExecution({
			sessionId: id,
			projectId: this.projectId,
			cwd: this.projectRoot,
			runDirectory: this.sessionMeta.get(id)?.runDirectory ?? "runs",
			language: this.sessionMeta.get(id)?.language ?? "unknown",
			code,
			execution,
		});
		return execution;
	}
	async exportKernel(sessionId: string) {
		await this.init();
		const id = safeSessionId(sessionId);
		const session = this.sessions.get(id);
		if (!session)
			throw new Error(
				"Discovery kernel session is not active; create a new session",
			);
		await this.authorize({
			kind: "export-kernel",
			projectId: this.projectId,
			sessionId: id,
		});
		return session.export();
	}
	async closeKernelSession(sessionId: string): Promise<void> {
		await this.init();
		const id = safeSessionId(sessionId);
		await this.authorize({
			kind: "close-kernel-session",
			projectId: this.projectId,
			sessionId: id,
		});
		const session = this.sessions.get(id);
		await session?.close();
		await this.executions.get(id);
		const meta = this.sessionMeta.get(id);
		if (meta)
			this.sessionMeta.set(id, {
				...meta,
				status: session?.status.status ?? "closed",
				executionCount: session?.status.executionCount ?? meta.executionCount,
			});
		await this.persistSessions();
	}

	async createExplorationPlan(input: {
		readonly id: string;
		readonly hypothesisId: string;
		readonly prior: QuestionPrior;
		readonly budget: DiscoveryExplorationBudget;
		readonly candidates: readonly Parameters<
			typeof rankExplorationCandidates
		>[0][number][];
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
		const result = await runCriticReview(
			request,
			this.options.services.criticProvider,
		);
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
		executor: (
			path: MultipathPlan["paths"][number],
		) => Promise<MultipathPathExecutionResult>,
	): Promise<DiscoveryMultipathAssessment> {
		await this.init();
		await this.authorize({
			kind: "multipath-execution",
			projectId: this.projectId,
			planId: plan.id,
		});
		const assessment = await executeMultiPath(
			createMultiPathPlan(plan),
			executor,
			{
				projectId: this.projectId,
				inquiry: this.options.services.inquiry,
			},
		);
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
	async listMultipathAssessments(): Promise<
		readonly DiscoveryMultipathAssessment[]
	> {
		await this.init();
		return this.multipaths.map(
			({ recordedAt: _recordedAt, ...value }) => value,
		);
	}
	async runEvaluation(
		cases: readonly DiscoveryEvaluationCase[],
		evaluator: (
			item: DiscoveryEvaluationCase,
		) => Promise<DiscoveryEvaluationObservation>,
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
		this.disposal = this.disposeSessions();
		return this.disposal;
	}

	private async disposeSessions(): Promise<void> {
		const settled = await Promise.allSettled([
			...Array.from(this.sessions.values(), (session) => session.close()),
			...this.executions.values(),
		]);
		const failures = settled.filter(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		if (failures.length)
			throw new AggregateError(
				failures.map((result) => result.reason),
				"Discovery execution cleanup failed",
			);
		for (const [id, session] of this.sessions) {
			const meta = this.sessionMeta.get(id);
			if (!meta)
				throw new Error("Active discovery session has no journal metadata");
			this.sessionMeta.set(id, {
				...meta,
				status: session.status.status,
				executionCount: session.status.executionCount,
			});
		}
		if (this.sessions.size) await this.persistSessions();
		this.sessions.clear();
	}
}
