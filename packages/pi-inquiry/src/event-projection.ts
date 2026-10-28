import type {
	ArtifactLocation,
	ArtifactPurpose,
	ArtifactRecord,
	ArtifactSource,
	ArtifactStatus,
	AttemptOutcome,
	AttemptRecord,
	DecisionKind,
	DecisionRecord,
	RunProvenanceSummary,
} from "./models.js";
import type { InquiryService } from "./service.js";
import type { InquiryStorage } from "./storage-contract.js";

/** Metadata accepted from a trusted host event after it has verified the file. */
export interface InquiryEventArtifact {
	readonly id?: string;
	readonly path: string;
	readonly bytes?: number;
	/** `size` is accepted for runner manifests that use that spelling. */
	readonly size?: number;
	readonly sha256?: string;
	readonly location?: ArtifactLocation;
	readonly purpose?: ArtifactPurpose;
	readonly status?: ArtifactStatus;
	readonly parentIds?: readonly string[];
	readonly runId?: string;
	readonly sourceKind?: ArtifactSource["kind"];
	readonly sourceId?: string;
}

export interface InquiryEventManifest {
	readonly entries?: readonly InquiryEventArtifact[];
}

/** Structural compute event contract; no compute package is imported here. */
export interface InquiryComputeEvent {
	readonly id: string;
	readonly jobId: string;
	readonly type:
		| "created"
		| "submitted"
		| "status"
		| "logs"
		| "collected"
		| "cancelled"
		| "error";
	readonly at: number | string;
	readonly status?: string;
	readonly cursor?: string;
	readonly detail?: string;
	readonly runId?: string;
	readonly startedAt?: number | string;
	readonly codeFingerprint?: string;
	readonly parameters?: Readonly<
		Record<string, string | number | boolean | null>
	>;
	readonly hostId?: string;
	readonly sessionId?: string;
	readonly turn?: number;
	readonly runProvenance?: RunProvenanceSummary;
	readonly artifacts?: readonly InquiryEventArtifact[];
	readonly manifest?: InquiryEventManifest;
	readonly projectId?: string;
}

/** Terminal task projection supplied by the task/workflow host. */
export interface InquiryTaskTerminalEvent {
	readonly id: string;
	readonly taskId: string;
	readonly runId?: string;
	readonly status:
		| "succeeded"
		| "failed"
		| "cancelled"
		| "blocked"
		| "partial"
		| "unknown";
	readonly at?: number | string;
	readonly startedAt?: number | string;
	readonly detail?: string;
	readonly codeFingerprint?: string;
	readonly parameters?: Readonly<
		Record<string, string | number | boolean | null>
	>;
	readonly sessionId?: string;
	readonly turn?: number;
	readonly runProvenance?: RunProvenanceSummary;
	readonly artifacts?: readonly InquiryEventArtifact[];
	readonly manifest?: InquiryEventManifest;
	readonly projectId?: string;
}

/** Host-verified provenance for a local script or discovery execution. */
export interface InquiryLocalExecutionEvent {
	readonly id: string;
	readonly projectId?: string;
	readonly sessionId?: string;
	readonly turn?: number;
	readonly toolName: string;
	readonly startedAt?: number | string;
	readonly finishedAt?: number | string;
	readonly codeFingerprint: string;
	readonly parameters: Readonly<
		Record<string, string | number | boolean | null>
	>;
	readonly runProvenance: RunProvenanceSummary;
	readonly outcome: AttemptOutcome;
	readonly artifacts?: readonly InquiryEventArtifact[];
}

/** Host callbacks keep the domain package independent from compute/tasks. */
export interface InquiryEventSource {
	readonly onComputeEvent?: (
		handler: (event: InquiryComputeEvent) => void,
	) => () => void;
	readonly onTaskTerminal?: (
		handler: (event: InquiryTaskTerminalEvent) => void,
	) => () => void;
	readonly onLocalExecution?: (
		handler: (event: InquiryLocalExecutionEvent) => void,
	) => () => void;
	readonly onDecision?: (
		handler: (event: InquiryDecisionEvent) => void,
	) => () => void;
	readonly enrichComputeEvent?: (
		event: InquiryComputeEvent,
	) => Promise<InquiryComputeEvent>;
}

/** Successful host receipt for an agent-made decision. */
export interface InquiryDecisionEvent {
	readonly id: string;
	readonly kind: DecisionKind;
	readonly summary: string;
	readonly basis?: readonly string[];
	readonly affectedArtifactIds?: readonly string[];
	readonly at?: number | string;
	readonly projectId?: string;
}

const TERMINAL_COMPUTE_STATUSES = new Set([
	"succeeded",
	"failed",
	"cancelled",
	"blocked",
	"partial",
]);
const TERMINAL_TASK_STATUSES = new Set([
	"succeeded",
	"failed",
	"cancelled",
	"blocked",
	"partial",
	"unknown",
]);
const SHA256 = /^[a-f0-9]{64}$/i;

function asIso(value: number | string | undefined): string {
	if (typeof value === "number" && Number.isFinite(value))
		return new Date(value).toISOString();
	if (typeof value === "string" && Number.isFinite(Date.parse(value)))
		return new Date(value).toISOString();
	return new Date().toISOString();
}

function outcomeFor(
	status: string | undefined,
	eventType?: InquiryComputeEvent["type"],
): AttemptOutcome {
	if (eventType === "error" || status === "failed") return "failed";
	if (eventType === "collected" || status === "succeeded") return "succeeded";
	if (eventType === "cancelled") return "blocked";
	if (status === "cancelled" || status === "blocked") return "blocked";
	return "unknown";
}

function nonEmpty(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized || undefined;
}

function summary(value: string | undefined): string | undefined {
	return nonEmpty(value);
}

/** Canonical event-to-ledger SQL projection. Events are asserted data; callers supply no host authority. */
export class InquiryEventProjector {
	constructor(
		private readonly storage: InquiryStorage,
		private readonly domain: InquiryService,
		private readonly canonicalProjectId: (value: string | undefined) => string,
	) {}
	/** Record a terminal/collection compute event. Non-terminal progress is ignored. */
	async recordComputeEvent(event: InquiryComputeEvent): Promise<void> {
		if (event.type === "submitted") {
			await this.recordDecision({
				id: `compute-submit:${event.jobId}`,
				kind: "compute-submit",
				summary: `Submitted compute job ${event.jobId}`,
				basis: [`job:${event.jobId}`, event.id],
				at: event.at,
				projectId: event.projectId,
			});
		}
		if (
			event.type !== "collected" &&
			event.type !== "cancelled" &&
			event.type !== "error" &&
			!TERMINAL_COMPUTE_STATUSES.has(event.status ?? "")
		)
			return;
		this.assertProject(event.projectId);
		const executionId = nonEmpty(event.runId) ?? event.jobId;
		const eventAt = asIso(event.at);
		const artifactIds = await this.recordArtifacts(
			"run",
			executionId,
			event.artifacts ?? event.manifest?.entries,
			eventAt,
			event.status === "succeeded" || event.type === "collected"
				? "deliverable"
				: "intermediate",
			"remote",
			event.runId ?? event.jobId,
			event.sessionId,
			event.turn,
			event.runProvenance,
		);
		const attempt: AttemptRecord = {
			id: `compute:${executionId}`,
			schemaVersion: 2,
			projectId: this.storage.projectId,
			hypothesisIds: [],
			parameters: {
				source: "compute",
				jobId: event.jobId,
				...(event.runId ? { runId: event.runId } : {}),
				eventType: event.type,
				status: event.status ?? null,
				...(event.hostId ? { hostId: event.hostId } : {}),
				...(event.parameters ?? {}),
			},
			artifactIds,
			...(summary(event.detail)
				? { resultSummary: summary(event.detail) }
				: {}),
			outcome: outcomeFor(event.status, event.type),
			enteredReport: false,
			startedAt: asIso(event.startedAt ?? event.at),
			finishedAt: eventAt,
			...(event.codeFingerprint
				? { codeFingerprint: event.codeFingerprint }
				: {}),
			...(event.sessionId ? { sessionId: event.sessionId } : {}),
			...(event.turn !== undefined ? { turn: event.turn } : {}),
			...(event.runProvenance ? { runProvenance: event.runProvenance } : {}),
		};
		await this.domain.recordAttempt(attempt);
		await this.associateReceipts(
			[`job:${event.jobId}`, `run:${executionId}`],
			artifactIds,
		);
	}

	/** Record a terminal task/workflow event and its verified artifact metadata. */
	async recordTaskTerminal(event: InquiryTaskTerminalEvent): Promise<void> {
		if (!TERMINAL_TASK_STATUSES.has(event.status)) return;
		this.assertProject(event.projectId);
		const executionId = nonEmpty(event.runId) ?? event.taskId;
		const eventAt = asIso(event.at);
		const artifactIds = await this.recordArtifacts(
			"task",
			executionId,
			event.artifacts ?? event.manifest?.entries,
			eventAt,
			event.status === "succeeded" ? "deliverable" : "intermediate",
			"local",
			event.runId ?? event.taskId,
			event.sessionId,
			event.turn,
			event.runProvenance,
		);
		const attempt: AttemptRecord = {
			id: `task:${executionId}`,
			schemaVersion: 2,
			projectId: this.storage.projectId,
			hypothesisIds: [],
			parameters: {
				source: "task",
				taskId: event.taskId,
				...(event.runId ? { runId: event.runId } : {}),
				status: event.status,
				...(event.parameters ?? {}),
			},
			artifactIds,
			...(summary(event.detail)
				? { resultSummary: summary(event.detail) }
				: {}),
			outcome: outcomeFor(event.status),
			enteredReport: false,
			startedAt: asIso(event.startedAt ?? event.at),
			finishedAt: eventAt,
			...(event.codeFingerprint
				? { codeFingerprint: event.codeFingerprint }
				: {}),
			...(event.sessionId ? { sessionId: event.sessionId } : {}),
			...(event.turn !== undefined ? { turn: event.turn } : {}),
			...(event.runProvenance ? { runProvenance: event.runProvenance } : {}),
		};
		await this.domain.recordAttempt(attempt);
		await this.associateReceipts(
			[`task:${event.taskId}`, `run:${executionId}`],
			artifactIds,
		);
	}

	/** Record provenance for host-local bash/kernel work without retaining source or output contents. */
	async recordLocalExecution(event: InquiryLocalExecutionEvent): Promise<void> {
		this.assertProject(event.projectId);
		const finishedAt = asIso(event.finishedAt ?? event.startedAt);
		const artifactIds = await this.recordArtifacts(
			"run",
			event.id,
			event.artifacts,
			finishedAt,
			"deliverable",
			"local",
			event.id,
			event.sessionId,
			event.turn,
			event.runProvenance,
		);
		await this.domain.recordAttempt({
			id: `local:${event.id}`,
			schemaVersion: 2,
			projectId: this.storage.projectId,
			hypothesisIds: [],
			codeFingerprint: event.codeFingerprint,
			parameters: {
				source: "local",
				tool: event.toolName,
				...event.parameters,
			},
			artifactIds,
			outcome: event.outcome,
			enteredReport: false,
			startedAt: asIso(event.startedAt ?? event.finishedAt),
			finishedAt,
			...(event.sessionId ? { sessionId: event.sessionId } : {}),
			...(event.turn !== undefined ? { turn: event.turn } : {}),
			runProvenance: event.runProvenance,
		});
		await this.associateReceipts(
			[`tool:${event.id}`, `run:${event.id}`],
			artifactIds,
		);
	}

	async recordDecision(
		event: InquiryDecisionEvent | DecisionRecord,
	): Promise<void> {
		const eventProjectId = event.projectId
			? this.canonicalProjectId(event.projectId)
			: undefined;
		if (eventProjectId && eventProjectId !== this.storage.projectId)
			throw new Error(
				`Inquiry decision belongs to another project: ${event.projectId}`,
			);
		const record: DecisionRecord =
			"schemaVersion" in event
				? { ...event, projectId: this.storage.projectId }
				: {
						id: event.id,
						schemaVersion: 2,
						projectId: this.storage.projectId,
						kind: event.kind,
						summary: event.summary,
						basis: [...new Set(event.basis ?? [])],
						affectedArtifactIds: [...new Set(event.affectedArtifactIds ?? [])],
						status: "active",
						createdAt: asIso(event.at),
					};
		const snapshot = await this.storage.snapshot();
		const related = snapshot.artifacts.filter((item) =>
			record.basis.some(
				(basis) =>
					basis === `${item.source.kind}:${item.source.id}` ||
					basis === `run:${item.runId}`,
			),
		);
		await this.domain.recordDecision({
			...record,
			affectedArtifactIds: [
				...new Set([
					...record.affectedArtifactIds,
					...related.map((item) => item.id),
				]),
			],
		});
	}

	private async associateReceipts(
		basis: readonly string[],
		artifactIds: readonly string[],
	): Promise<void> {
		if (!artifactIds.length) return;
		for (const decision of await this.domain.listDecisions()) {
			if (decision.basis.some((item) => basis.includes(item)))
				await this.domain.associateDecisionArtifacts(decision.id, artifactIds);
		}
	}

	private assertProject(projectId: string | undefined): void {
		if (
			projectId &&
			this.canonicalProjectId(projectId) !== this.storage.projectId
		)
			throw new Error(`Inquiry event belongs to another project: ${projectId}`);
	}

	private async recordArtifacts(
		kind: "run" | "task",
		executionId: string,
		entries: readonly InquiryEventArtifact[] | undefined,
		eventAt: string,
		defaultPurpose: ArtifactPurpose,
		defaultLocation: ArtifactLocation,
		defaultRunId: string,
		sessionId?: string,
		turn?: number,
		runProvenance?: RunProvenanceSummary,
	): Promise<string[]> {
		if (!entries?.length) return [];
		const artifactIds: string[] = [];
		for (const entry of entries) {
			const record = this.artifactRecord(
				kind,
				executionId,
				entry,
				eventAt,
				defaultPurpose,
				defaultLocation,
				defaultRunId,
				sessionId,
				turn,
				runProvenance,
			);
			if (!record) continue;
			await this.domain.recordArtifact(record);
			artifactIds.push(record.id);
		}
		return artifactIds;
	}

	private artifactRecord(
		kind: "run" | "task",
		executionId: string,
		entry: InquiryEventArtifact,
		eventAt: string,
		defaultPurpose: ArtifactPurpose,
		defaultLocation: ArtifactLocation,
		defaultRunId: string,
		sessionId?: string,
		turn?: number,
		runProvenance?: RunProvenanceSummary,
	): ArtifactRecord | undefined {
		const bytes = entry.bytes ?? entry.size;
		const sha256 = entry.sha256?.trim();
		if (
			typeof entry.path !== "string" ||
			!entry.path.trim() ||
			!Number.isSafeInteger(bytes) ||
			(bytes as number) < 0 ||
			!sha256 ||
			!SHA256.test(sha256)
		)
			return undefined;
		const id =
			nonEmpty(entry.id) ??
			`${kind}:${executionId}:${entry.path.replaceAll("\\", "/")}:${sha256.toLowerCase()}`;
		return {
			id,
			schemaVersion: 2,
			projectId: this.storage.projectId,
			location: entry.location ?? defaultLocation,
			path: entry.path,
			bytes: bytes as number,
			sha256,
			source: {
				kind: entry.sourceKind ?? kind,
				id: nonEmpty(entry.sourceId) ?? executionId,
			},
			purpose: entry.purpose ?? defaultPurpose,
			status: entry.status ?? "valid",
			parentIds: [...new Set(entry.parentIds ?? [])],
			runId: nonEmpty(entry.runId) ?? defaultRunId,
			...(sessionId ? { sessionId } : {}),
			...(turn !== undefined ? { turn } : {}),
			...(runProvenance ? { runProvenance } : {}),
			createdAt: eventAt,
			updatedAt: eventAt,
		};
	}
}
