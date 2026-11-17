import { isAbsolute, relative, resolve } from "node:path";
import {
	type ControlledKernelRunner,
	type KernelLanguage,
	type KernelRunnerCapabilities,
	KernelSession,
	type KernelSessionOptions,
} from "./domain/index.js";
import type { DiscoveryAuthorizationOperation, DiscoveryJournal } from "./ports.js";
import type {
	DiscoveryCapabilities,
	DiscoveryDataClassification,
	DiscoveryKernelLanguage,
	DiscoveryKernelSession,
} from "./projections.js";
import type { DiscoveryKernelSessionInput, DiscoveryServiceOptions } from "./service-contracts.js";

export interface PersistedSession {
	readonly sessionId: string;
	readonly runDirectory: string;
	readonly language: DiscoveryKernelLanguage;
	readonly dataClassification: DiscoveryDataClassification;
	readonly status: DiscoveryKernelSession["status"];
	readonly executionCount: number;
	readonly capabilities: KernelRunnerCapabilities;
	readonly createdAt: string;
}

export function safeSessionId(value: string): string {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error("Invalid discovery session id");
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
function toCapabilities(value: KernelRunnerCapabilities): DiscoveryCapabilities {
	return {
		kind: value.kind,
		languages: [...value.languages],
		networkDisabled: value.networkDisabled,
		writesOnlyToRunDirectory: value.writesOnlyToRunDirectory,
	};
}

export class DiscoveryKernelSessions {
	private readonly sessions = new Map<string, KernelSession>();
	private creations = Promise.resolve();
	private sessionWrites = Promise.resolve();
	private sessionsRevision = 0;
	private savedSessionsRevision = 0;
	private readonly executions = new Map<string, Promise<Awaited<ReturnType<KernelSession["execute"]>>>>();
	private readonly executionSignals = new Map<string, AbortSignal>();

	constructor(
		readonly projectId: string,
		readonly projectRoot: string,
		private readonly options: DiscoveryServiceOptions,
		private readonly sessionsStore: DiscoveryJournal<PersistedSession>,
		private readonly sessionMeta: Map<string, PersistedSession>,
		private readonly init: () => Promise<void>,
		private readonly isDisposed: () => boolean,
	) {}

	private get disposed(): boolean {
		return this.isDisposed();
	}

	private async authorize(operation: DiscoveryAuthorizationOperation): Promise<void> {
		await this.options.services.authorize(operation);
	}
	private runnerFor(language: KernelLanguage): Promise<ControlledKernelRunner> {
		return this.options.services.runner(language);
	}

	async getCapabilities(language: DiscoveryKernelLanguage): Promise<DiscoveryCapabilities> {
		const runner = await this.runnerFor(language);
		return toCapabilities(runner.capabilities);
	}

	private writeSessions(write: () => Promise<void>): Promise<void> {
		const pending = this.sessionWrites.then(write);
		// The original promise returns each failure to its caller; later authorized writes may retry.
		this.sessionWrites = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	}
	private persistSessions(): Promise<void> {
		return this.writeSessions(async () => {
			const revision = this.sessionsRevision;
			await this.sessionsStore.write([...this.sessionMeta.values()]);
			this.savedSessionsRevision = revision;
		});
	}
	/** Called only by an explicit legitimate runtime reconcile operation, never by dispose. */
	async persistObservedKernelStates(): Promise<void> {
		await this.init();
		for (const [id, session] of this.sessions) {
			const meta = this.sessionMeta.get(id);
			if (!meta) throw new Error("Active discovery session has no journal metadata");
			if (meta.status !== session.status.status || meta.executionCount !== session.status.executionCount) {
				this.sessionMeta.set(id, {
					...meta,
					status: session.status.status,
					executionCount: session.status.executionCount,
				});
				this.sessionsRevision++;
			}
		}
		if (this.savedSessionsRevision !== this.sessionsRevision) await this.persistSessions();
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
	async getKernelSession(sessionId: string): Promise<DiscoveryKernelSession | null> {
		await this.init();
		return this.sessionProjection(safeSessionId(sessionId));
	}
	createKernelSession(input: DiscoveryKernelSessionInput): Promise<DiscoveryKernelSession> {
		const pending = this.creations.then(() => this.createKernel(input));
		this.creations = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	}
	private async createKernel(input: DiscoveryKernelSessionInput): Promise<DiscoveryKernelSession> {
		await this.init();
		const sessionId = safeSessionId(input.sessionId);
		if (this.sessionMeta.has(sessionId)) throw new Error(`Discovery session already exists: ${sessionId}`);
		const runDirectory = safeRunDirectory(this.projectRoot, input.runDirectory);
		await this.authorize({
			kind: "create-kernel-session",
			projectId: this.projectId,
		});
		const runner = await this.runnerFor(input.language);
		if (this.disposed) throw new Error("discovery service is disposed");
		const options: KernelSessionOptions = {
			sessionId,
			runDirectory,
			language: input.language,
			dataClassification: input.dataClassification,
			runner,
			writer: this.options.services.files,
			...(input.idleTimeoutMs === undefined ? {} : { idleTimeoutMs: input.idleTimeoutMs }),
			...(input.executionTimeoutMs === undefined ? {} : { executionTimeoutMs: input.executionTimeoutMs }),
			...(input.maxExecutions === undefined ? {} : { maxExecutions: input.maxExecutions }),
			...(input.maxOutputBytes === undefined ? {} : { maxOutputBytes: input.maxOutputBytes }),
		};
		const session = new KernelSession(options);
		const metadata: PersistedSession = {
			sessionId,
			runDirectory,
			language: input.language,
			dataClassification: input.dataClassification,
			status: session.status.status,
			executionCount: session.status.executionCount,
			capabilities: runner.capabilities,
			createdAt: new Date().toISOString(),
		};
		try {
			await this.writeSessions(async () => {
				const revision = this.sessionsRevision;
				await this.sessionsStore.write([...this.sessionMeta.values(), metadata]);
				this.savedSessionsRevision = revision;
				if (this.disposed) throw new Error("Discovery service was disposed during kernel creation");
				this.sessions.set(sessionId, session);
				this.sessionMeta.set(sessionId, metadata);
			});
		} catch (error) {
			await session.close();
			throw error;
		}
		return this.sessionProjection(sessionId) as DiscoveryKernelSession;
	}
	async executeKernel(
		sessionId: string,
		code: string,
		signal?: AbortSignal,
	): Promise<Awaited<ReturnType<KernelSession["execute"]>>> {
		await this.init();
		const id = safeSessionId(sessionId);
		const session = this.sessions.get(id);
		if (!session) throw new Error("Discovery kernel session is not active; create a new session");
		await this.authorize({
			kind: "execute-kernel",
			projectId: this.projectId,
			sessionId: id,
		});
		if (this.disposed) throw new Error("discovery service is disposed");
		if (this.executions.has(id)) throw new Error("discovery kernel execution is already running");
		signal?.throwIfAborted();
		const pending = this.executeSession(id, code, session, signal);
		this.executions.set(id, pending);
		if (signal) this.executionSignals.set(id, signal);
		try {
			return await pending;
		} finally {
			if (this.executions.get(id) === pending) {
				this.executions.delete(id);
				this.executionSignals.delete(id);
			}
		}
	}

	private async executeSession(
		id: string,
		code: string,
		session: KernelSession,
		signal?: AbortSignal,
	): Promise<Awaited<ReturnType<KernelSession["execute"]>>> {
		const execution = await session.execute(code, signal);
		signal?.throwIfAborted();
		const meta = this.sessionMeta.get(id);
		if (!meta) throw new Error("Active discovery session has no journal metadata");
		this.sessionMeta.set(id, {
			...meta,
			status: session.status.status,
			executionCount: session.status.executionCount,
		});
		this.sessionsRevision++;
		await this.persistSessions();
		await this.options.services.onExecution({
			sessionId: id,
			projectId: this.projectId,
			cwd: this.projectRoot,
			runDirectory: meta.runDirectory,
			language: meta.language,
			code,
			execution,
		});
		return execution;
	}
	async exportKernel(sessionId: string) {
		await this.init();
		const id = safeSessionId(sessionId);
		const session = this.sessions.get(id);
		if (!session) throw new Error("Discovery kernel session is not active; create a new session");
		await this.authorize({
			kind: "export-kernel",
			projectId: this.projectId,
			sessionId: id,
		});
		return session.export();
	}
	/** Resource-only shutdown: no capability, caller replacement or journal write is borrowed. */
	async disposeKernelSession(sessionId: string): Promise<void> {
		const id = safeSessionId(sessionId);
		const session = this.sessions.get(id);
		const execution = this.executions.get(id),
			signal = this.executionSignals.get(id);
		await session?.close();
		const [completed] = await Promise.allSettled([execution]);
		if (completed.status === "rejected" && !signal?.aborted) throw completed.reason;
		const meta = this.sessionMeta.get(id);
		if (meta && session)
			this.sessionMeta.set(id, {
				...meta,
				status: session.status.status,
				executionCount: session.status.executionCount,
			});
		this.sessionsRevision++;
	}
	async closeKernelSession(sessionId: string): Promise<void> {
		await this.init();
		const id = safeSessionId(sessionId);
		await this.authorize({
			kind: "close-kernel-session",
			projectId: this.projectId,
			sessionId: id,
		});
		await this.disposeKernelSession(id);
		await this.persistSessions();
	}

	async disposeSessions(): Promise<void> {
		const sessionClosures = [...this.sessions.values()].map((session) => session.close());
		const executions = [...this.executions].map(([id, pending]) => ({
			pending,
			signal: this.executionSignals.get(id),
		}));
		const settled = await Promise.allSettled([...sessionClosures, ...executions.map((item) => item.pending)]);
		const failures = settled.filter(
			(result, index): result is PromiseRejectedResult =>
				result.status === "rejected" &&
				(index < sessionClosures.length || !executions[index - sessionClosures.length]?.signal?.aborted),
		);
		if (failures.length)
			throw new AggregateError(
				failures.map((result) => result.reason),
				"Discovery execution cleanup failed",
			);
		for (const [id, session] of this.sessions) {
			const meta = this.sessionMeta.get(id);
			if (!meta) throw new Error("Active discovery session has no journal metadata");
			this.sessionMeta.set(id, {
				...meta,
				status: session.status.status,
				executionCount: session.status.executionCount,
			});
		}
		this.sessions.clear();
	}
}
