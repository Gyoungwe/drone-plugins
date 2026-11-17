export type KernelLanguage = "python" | "r";
export type KernelSessionStatus =
	| "ready"
	| "running"
	| "closed"
	| "idle-timeout"
	| "needs-container"
	| "cleanup-failed";
export type DataClassification = "public" | "internal" | "controlled" | "restricted";
export type KernelContentKind = "summary" | "plot" | "table" | "raw";

export interface KernelRunnerCapabilities {
	/** `container` is the only production capability. `fixture` is test-only and explicit. */
	readonly kind: "container" | "fixture" | "unavailable";
	readonly languages: readonly KernelLanguage[];
	readonly networkDisabled: boolean;
	readonly writesOnlyToRunDirectory: boolean;
}

export interface KernelRunRequest {
	/** Cancellation completes only after the runner verifies resource cleanup. */
	readonly signal?: AbortSignal;
	readonly requestId: string;
	readonly language: KernelLanguage;
	readonly code: string;
	readonly runDirectory: string;
	readonly timeoutMs: number;
	readonly maxOutputBytes: number;
	readonly dataClassification: DataClassification;
}

export interface KernelRunOutput {
	readonly text: string;
	readonly contentKind: KernelContentKind;
	readonly classification: DataClassification;
}

export interface KernelRunResult {
	readonly exitCode: number;
	readonly outputs: readonly KernelRunOutput[];
	readonly durationMs: number;
	readonly producedBytes: number;
}

/** The only execution seam exposed to a production KernelSession. It has no shell method. */
export interface ControlledKernelRunner {
	readonly capabilities: KernelRunnerCapabilities;
	run(request: KernelRunRequest): Promise<KernelRunResult>;
}

export interface RunFileWriter {
	write(path: string, content: string, mediaType: string): Promise<unknown>;
}

export interface KernelSessionOptions {
	readonly sessionId: string;
	readonly runDirectory: string;
	readonly language: KernelLanguage;
	readonly dataClassification: DataClassification;
	readonly runner: ControlledKernelRunner;
	readonly writer?: RunFileWriter;
	readonly idleTimeoutMs?: number;
	readonly executionTimeoutMs?: number;
	readonly maxExecutions?: number;
	readonly maxOutputBytes?: number;
	readonly now?: () => number;
}

export interface KernelExecution {
	readonly id: string;
	readonly code: string;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly status: "succeeded" | "failed" | "blocked";
	readonly exitCode?: number;
	readonly output: string;
	readonly outputClassification: DataClassification;
	readonly contentKinds: readonly KernelContentKind[];
	readonly producedBytes: number;
	readonly redactedBytes: number;
	readonly blockedReason?: string;
}

export interface KernelExport {
	readonly scriptPath: string;
	readonly notebookPath: string;
	readonly script: string;
	readonly notebook: string;
}

export interface KernelStatus {
	readonly sessionId: string;
	readonly status: KernelSessionStatus;
	readonly executionCount: number;
	readonly remainingExecutions: number;
	readonly expiresAt?: string;
}

export type KernelPreparation =
	| {
			readonly status: "ready";
			readonly capabilities: KernelRunnerCapabilities;
	  }
	| { readonly status: "needs-container"; readonly reason: string };
