import type {
	ArtifactLocation,
	ArtifactPurpose,
	ArtifactSource,
	ArtifactStatus,
	AttemptOutcome,
	DecisionKind,
	RunProvenanceSummary,
} from "./models.js";

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
	readonly type: "created" | "submitted" | "status" | "logs" | "collected" | "cancelled" | "error";
	readonly at: number | string;
	readonly status?: string;
	readonly cursor?: string;
	readonly detail?: string;
	readonly runId?: string;
	readonly startedAt?: number | string;
	readonly codeFingerprint?: string;
	readonly parameters?: Readonly<Record<string, string | number | boolean | null>>;
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
	readonly status: "succeeded" | "failed" | "cancelled" | "blocked" | "partial" | "unknown";
	readonly at?: number | string;
	readonly startedAt?: number | string;
	readonly detail?: string;
	readonly codeFingerprint?: string;
	readonly parameters?: Readonly<Record<string, string | number | boolean | null>>;
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
	readonly parameters: Readonly<Record<string, string | number | boolean | null>>;
	readonly runProvenance: RunProvenanceSummary;
	readonly outcome: AttemptOutcome;
	readonly artifacts?: readonly InquiryEventArtifact[];
}

/** Host callbacks keep the domain package independent from compute/tasks. */
export interface InquiryEventSource {
	readonly onComputeEvent?: (handler: (event: InquiryComputeEvent) => void) => () => void;
	readonly onTaskTerminal?: (handler: (event: InquiryTaskTerminalEvent) => void) => () => void;
	readonly onLocalExecution?: (handler: (event: InquiryLocalExecutionEvent) => void) => () => void;
	readonly onDecision?: (handler: (event: InquiryDecisionEvent) => void) => () => void;
	readonly enrichComputeEvent?: (event: InquiryComputeEvent) => Promise<InquiryComputeEvent>;
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
