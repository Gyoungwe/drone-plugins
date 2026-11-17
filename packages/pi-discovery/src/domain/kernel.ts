import { randomUUID } from "node:crypto";
import {
	DEFAULT_MAX_OUTPUT_BYTES,
	filterKernelOutput,
	notebookFor,
	validClassification,
} from "./kernel-output.js";
import type {
	KernelExecution,
	KernelExport,
	KernelSessionOptions,
	KernelSessionStatus,
	KernelStatus,
	RunFileWriter,
} from "./kernel-types.js";
import {
	assertValid,
	boundedInteger,
	MAX_CODE_LENGTH,
	nonEmptyText,
	safeId,
	safeRunPath,
} from "./validation.js";

export { filterKernelOutput } from "./kernel-output.js";
export {
	prepareKernel,
	SubprocessFixtureRunner,
	UnavailableKernelRunner,
} from "./kernel-runners.js";
export type {
	ControlledKernelRunner,
	DataClassification,
	KernelContentKind,
	KernelExecution,
	KernelExport,
	KernelLanguage,
	KernelPreparation,
	KernelRunnerCapabilities,
	KernelRunOutput,
	KernelRunRequest,
	KernelRunResult,
	KernelSessionOptions,
	KernelSessionStatus,
	KernelStatus,
	RunFileWriter,
} from "./kernel-types.js";

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_EXECUTIONS = 32;

function ensureOptions(options: KernelSessionOptions): void {
	assertValid(safeId(options.sessionId), "sessionId is invalid");
	assertValid(safeRunPath(options.runDirectory), "runDirectory must be a project-relative runs path");
	assertValid(options.language === "python" || options.language === "r", "unsupported kernel language");
	assertValid(validClassification(options.dataClassification), "invalid data classification");
	assertValid(options.runner && typeof options.runner.run === "function", "controlled runner is required");
	const capabilities = options.runner.capabilities;
	assertValid(
		capabilities.kind === "container" ||
			capabilities.kind === "fixture" ||
			capabilities.kind === "unavailable",
		"invalid runner kind",
	);
	assertValid(capabilities.languages.includes(options.language), "runner does not support this language");
	if (capabilities.kind !== "unavailable") {
		assertValid(capabilities.networkDisabled, "kernel runner must disable network access");
		assertValid(capabilities.writesOnlyToRunDirectory, "kernel runner must constrain writes to runs");
	}
	for (const [label, value] of [
		["idleTimeoutMs", options.idleTimeoutMs],
		["executionTimeoutMs", options.executionTimeoutMs],
		["maxExecutions", options.maxExecutions],
		["maxOutputBytes", options.maxOutputBytes],
	] as const) {
		if (value !== undefined) assertValid(boundedInteger(value, 1, 24 * 60 * 60_000), `${label} is invalid`);
	}
}

export class KernelSession {
	private readonly options: Required<
		Pick<KernelSessionOptions, "idleTimeoutMs" | "executionTimeoutMs" | "maxExecutions" | "maxOutputBytes">
	> &
		KernelSessionOptions;
	private state: KernelSessionStatus;
	private executionCount = 0;
	private history: KernelExecution[] = [];
	private idleTimer?: ReturnType<typeof setTimeout>;
	private expiresAt?: number;
	private activeExecution?: Promise<KernelExecution>;
	private executionController?: AbortController;
	private closing?: Promise<void>;
	private cleanupFailure?: Error;

	constructor(options: KernelSessionOptions) {
		ensureOptions(options);
		this.options = {
			...options,
			idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
			executionTimeoutMs: options.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS,
			maxExecutions: options.maxExecutions ?? DEFAULT_MAX_EXECUTIONS,
			maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
		};
		this.state =
			options.runner.capabilities.kind === "container" || options.runner.capabilities.kind === "fixture"
				? "ready"
				: "needs-container";
		this.armIdleTimer();
	}

	get status(): KernelStatus {
		const remaining = Math.max(0, this.options.maxExecutions - this.executionCount);
		return {
			sessionId: this.options.sessionId,
			status: this.state,
			executionCount: this.executionCount,
			remainingExecutions: remaining,
			...(this.expiresAt === undefined ? {} : { expiresAt: new Date(this.expiresAt).toISOString() }),
		};
	}

	get executions(): readonly KernelExecution[] {
		return this.history;
	}

	async execute(code: string, signal?: AbortSignal): Promise<KernelExecution> {
		assertValid(this.state === "ready", `kernel session is ${this.state}`);
		assertValid(nonEmptyText(code, MAX_CODE_LENGTH), "kernel code is empty or too large");
		assertValid(this.executionCount < this.options.maxExecutions, "kernel execution budget exceeded");
		const controller = new AbortController();
		this.executionController = controller;
		signal?.throwIfAborted();
		const execution = this.executeActive(code, controller, signal);
		this.activeExecution = execution;
		try {
			return await execution;
		} finally {
			this.activeExecution = undefined;
			this.executionController = undefined;
		}
	}

	private async executeActive(
		code: string,
		controller: AbortController,
		callerSignal?: AbortSignal,
	): Promise<KernelExecution> {
		this.state = "running";
		this.executionCount += 1;
		this.armIdleTimer();
		const id = randomUUID();
		const startedAt = new Date(this.now()).toISOString();
		const timer = setTimeout(
			() => controller.abort(new Error("runner-timeout")),
			this.options.executionTimeoutMs,
		);
		let execution: KernelExecution;
		try {
			const result = await this.options.runner.run({
				signal: callerSignal ? AbortSignal.any([controller.signal, callerSignal]) : controller.signal,
				requestId: id,
				language: this.options.language,
				code,
				runDirectory: this.options.runDirectory,
				timeoutMs: this.options.executionTimeoutMs,
				maxOutputBytes: this.options.maxOutputBytes,
				dataClassification: this.options.dataClassification,
			});
			controller.signal.throwIfAborted();
			assertValid(result && Number.isInteger(result.exitCode), "runner returned invalid exit status");
			assertValid(
				Number.isFinite(result.producedBytes) && result.producedBytes >= 0,
				"runner returned invalid byte count",
			);
			const filtered = filterKernelOutput(
				result.outputs,
				this.options.dataClassification,
				this.options.maxOutputBytes,
			);
			const status =
				result.exitCode === 0 && !filtered.blocked
					? "succeeded"
					: result.exitCode === 0
						? "blocked"
						: "failed";
			execution = {
				id,
				code,
				startedAt,
				finishedAt: new Date(this.now()).toISOString(),
				status,
				...(result.exitCode === 0 ? { exitCode: result.exitCode } : {}),
				output: filtered.text,
				outputClassification: this.options.dataClassification,
				contentKinds: filtered.kinds,
				producedBytes: result.producedBytes,
				redactedBytes: filtered.redactedBytes,
				...(filtered.blocked ? { blockedReason: "output-policy" } : {}),
			};
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "DISCOVERY_CLEANUP_FAILED") {
				this.cleanupFailure = error;
				this.state = "cleanup-failed";
				throw error;
			}
			execution = {
				id,
				code,
				startedAt,
				finishedAt: new Date(this.now()).toISOString(),
				status: "failed",
				output: "",
				outputClassification: this.options.dataClassification,
				contentKinds: [],
				producedBytes: 0,
				redactedBytes: 0,
				blockedReason:
					controller.signal.reason instanceof Error && controller.signal.reason.message === "runner-timeout"
						? "timeout"
						: controller.signal.aborted
							? "cancelled"
							: error instanceof Error && "code" in error && error.code === "EXECUTION_IMAGE_NOT_CACHED"
								? "image-not-cached"
								: error instanceof Error && "code" in error && error.code === "EXECUTION_IMAGE_MISMATCH"
									? "image-mismatch"
									: "runner-failure",
			};
		} finally {
			clearTimeout(timer);
			if (this.state === "running") this.state = "ready";
			this.armIdleTimer();
		}
		this.history.push(execution);
		return execution;
	}

	export(writer?: RunFileWriter): Promise<KernelExport> {
		assertValid(this.state === "ready", `kernel session is ${this.state}`);
		const fileWriter = writer ?? this.options.writer;
		assertValid(
			fileWriter && typeof fileWriter.write === "function",
			"a run file writer is required for export",
		);
		const script = this.history.map((execution) => execution.code).join("\n\n");
		const notebook = notebookFor(this.history, this.options.language);
		const base = `${this.options.runDirectory}/exports/${this.options.sessionId}`;
		const scriptPath = `${base}.${this.options.language === "python" ? "py" : "R"}`;
		const notebookPath = `${base}.ipynb`;
		return Promise.all([
			fileWriter.write(scriptPath, script, this.options.language === "python" ? "text/x-python" : "text/x-r"),
			fileWriter.write(notebookPath, notebook, "application/x-ipynb+json"),
		]).then(() => ({ scriptPath, notebookPath, script, notebook }));
	}

	close(reason: "closed" | "idle-timeout" = "closed"): Promise<void> {
		if (this.closing) return this.closing;
		if (this.cleanupFailure) return Promise.reject(this.cleanupFailure);
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.executionController?.abort(new Error("kernel-closed"));
		this.closing = (async () => {
			await this.activeExecution;
			if (this.idleTimer) clearTimeout(this.idleTimer);
			this.state = reason;
		})();
		return this.closing;
	}

	private now(): number {
		return this.options.now?.() ?? Date.now();
	}

	private armIdleTimer(): void {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		if (this.state !== "ready") return;
		this.expiresAt = this.now() + this.options.idleTimeoutMs;
		this.idleTimer = setTimeout(() => this.close("idle-timeout"), this.options.idleTimeoutMs);
	}
}
