import { createHash } from "node:crypto";
import type {
	PluginBinaryStateReadResult,
	PluginRuntimeCapabilities,
	PluginRuntimeRootDescription,
	PluginStateReadResult,
} from "@gyoungwe/plugin-api/runtime";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import { InquiryService } from "./service.js";
import type {
	createInquiryWasmEngine,
	WasmInquiryStorage,
} from "./wasm-storage.js";
export type InquiryWasmEngine = Awaited<
	ReturnType<typeof createInquiryWasmEngine>
>;
const sha = Type.String({ pattern: "^[a-f0-9]{64}$" }),
	version = Type.Union([sha, Type.Null()]);
const intentSchema = Type.Object(
	{
		previousVersion: version,
		candidateVersion: sha,
		operation: Type.String({ minLength: 1 }),
		status: Type.Union([
			Type.Literal("pending"),
			Type.Literal("committed"),
			Type.Literal("not-committed"),
		]),
	},
	{ additionalProperties: false },
);
const bindingSchema = Type.Object(
	{
		schemaVersion: Type.Literal(1),
		workspaceId: Type.String({ minLength: 1 }),
		projectId: Type.String({ minLength: 1 }),
		binaryPath: Type.String({ minLength: 1 }),
		originalVersion: version,
		headVersion: version,
		backupVersion: version,
		intent: Type.Union([intentSchema, Type.Null()]),
	},
	{ additionalProperties: false },
);
export type InquiryBinding = Static<typeof bindingSchema>;
export interface InquiryBindingState {
	value: InquiryBinding;
	version: string;
	root: string;
	path: string;
}
export function parseInquiryBinding(
	result: PluginStateReadResult,
	workspaceId: string,
): InquiryBinding | null {
	if (result.kind === "missing") return null;
	if (
		!Check(bindingSchema, result.value) ||
		result.value.workspaceId !== workspaceId
	)
		throw new Error("Invalid Inquiry workspace binding");
	return result.value;
}
export const inquiryBindingPath = (workspaceId: string) =>
	`inquiry-${createHash("sha256").update(workspaceId).digest("hex")}.json`;
const bytes = (value: string) => new Uint8Array(Buffer.from(value, "base64"));
const digest = (value: Uint8Array) =>
	createHash("sha256").update(value).digest("hex");
const sidecars = [
	"ledger.sqlite-wal",
	"ledger.sqlite-shm",
	"ledger.sqlite-journal",
];
export class InquiryRecoveryRequired extends Error {
	readonly code = "INQUIRY_NEEDS_RECOVERY";
}
/** One application/workspace owner. Host capabilities are borrowed anew for every actual caller. */
export class InquiryLedgerOwner {
	private pending: Promise<void> = Promise.resolve();
	private stopped = false;
	private cleanupFailure: unknown;
	private current: WasmInquiryStorage | undefined;
	constructor(
		private readonly engine: InquiryWasmEngine,
		private readonly capabilities: PluginRuntimeCapabilities,
		private binding: InquiryBindingState,
		private readonly root: PluginRuntimeRootDescription,
	) {}
	private serialize<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.pending.then(() => {
			if (this.stopped) throw new Error("Inquiry owner is disposed");
			if (this.cleanupFailure)
				throw new Error(
					"Inquiry cleanup failed; explicit recovery is required",
					{ cause: this.cleanupFailure },
				);
			return operation();
		});
		this.pending = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}
	private async readRaw(): Promise<PluginBinaryStateReadResult> {
		for (const path of sidecars) {
			const value = (await this.capabilities.call("state.readBinary", {
				root: this.root.handle,
				path,
			})) as PluginBinaryStateReadResult;
			if (value.kind !== "missing")
				throw new Error(`Inquiry ledger has an active SQLite sidecar: ${path}`);
		}
		const raw = (await this.capabilities.call("state.readBinary", {
			root: this.root.handle,
			path: "ledger.sqlite",
		})) as PluginBinaryStateReadResult;
		for (const path of sidecars) {
			const value = (await this.capabilities.call("state.readBinary", {
				root: this.root.handle,
				path,
			})) as PluginBinaryStateReadResult;
			if (value.kind !== "missing")
				throw new Error(`Inquiry ledger has an active SQLite sidecar: ${path}`);
		}
		return raw;
	}
	private async writeBinding(value: InquiryBinding): Promise<void> {
		const result = (await this.capabilities.call("state.writeJson", {
			root: this.binding.root,
			path: this.binding.path,
			value,
			expectedVersion: this.binding.version,
		})) as PluginStateReadResult;
		if (
			result.kind !== "value" ||
			!Check(bindingSchema, result.value) ||
			result.value.workspaceId !== value.workspaceId ||
			JSON.stringify(result.value) !== JSON.stringify(value)
		)
			throw new Error("Inquiry binding did not read back after write");
		this.binding = { ...this.binding, value, version: result.version };
	}
	private async reserve(): Promise<void> {
		await this.capabilities.call("state.reserve", {
			root: this.root.handle,
			path: "",
		});
		await this.capabilities.call("state.reserve", {
			root: this.binding.root,
			path: "",
		});
	}
	private async openCurrent(): Promise<WasmInquiryStorage> {
		if (this.binding.value.intent?.status === "pending")
			throw new InquiryRecoveryRequired(
				"A prior Inquiry write requires explicit SHA reconciliation",
			);
		const raw = await this.readRaw();
		if (raw.version !== this.binding.value.headVersion)
			throw new InquiryRecoveryRequired(
				"Inquiry bytes changed outside this owner; no automatic adoption or retry",
			);
		if (!this.current)
			this.current = this.engine.open(
				this.binding.value.projectId,
				raw.kind === "value" ? bytes(raw.base64) : undefined,
			);
		return this.current;
	}
	async snapshot() {
		return this.serialize(async () =>
			new InquiryService(await this.openCurrent()).readOnlyState(),
		);
	}
	async read<T>(
		operation: (service: InquiryService) => Promise<T>,
	): Promise<T> {
		return this.serialize(async () =>
			operation(new InquiryService(await this.openCurrent())),
		);
	}
	private async backup(raw: PluginBinaryStateReadResult): Promise<void> {
		const original = this.binding.value.originalVersion;
		if (original === null) return;
		const path = `ledger.sqlite.pre-plugin-${original}.bak`;
		const stored = (await this.capabilities.call("state.readBinary", {
			root: this.root.handle,
			path,
		})) as PluginBinaryStateReadResult;
		if (stored.kind === "value") {
			if (stored.version !== original)
				throw new InquiryRecoveryRequired(
					"Original Inquiry backup bytes do not match their recorded SHA",
				);
			return;
		}
		if (raw.kind !== "value" || raw.version !== original)
			throw new InquiryRecoveryRequired(
				"Original Inquiry backup is missing after the ledger changed",
			);
		const copied = (await this.capabilities.call("state.writeBinary", {
			root: this.root.handle,
			path,
			base64: raw.base64,
			expectedVersion: null,
			assertAbsent: sidecars,
		})) as PluginBinaryStateReadResult;
		if (copied.kind !== "value" || copied.version !== original)
			throw new Error("Original Inquiry backup did not read back");
	}
	private async withStaged<T>(
		staged: WasmInquiryStorage,
		operation: () => Promise<T>,
	): Promise<T> {
		const [result] = await Promise.allSettled([operation()]);
		const [closed] = await Promise.allSettled([staged.close()]);
		if (closed.status === "rejected") {
			this.cleanupFailure = closed.reason;
			throw new AggregateError(
				result.status === "rejected"
					? [result.reason, closed.reason]
					: [closed.reason],
				"Inquiry staged operation or cleanup failed; writer lease retained",
			);
		}
		if (result.status === "rejected") throw result.reason;
		return result.value;
	}

	async write<T>(
		operation: string,
		mutate: (service: InquiryService) => Promise<T>,
		signal: AbortSignal,
	): Promise<T> {
		return this.serialize(async () => {
			signal.throwIfAborted();
			await this.reserve();
			const current = await this.openCurrent();
			const raw = await this.readRaw();
			signal.throwIfAborted();
			const staged = this.engine.open(
				this.binding.value.projectId,
				await current.exportBytes(),
			);
			return this.withStaged(staged, async () => {
				const result = await mutate(new InquiryService(staged));
				signal.throwIfAborted();
				const exported = await staged.exportBytes();
				const candidateVersion = digest(exported);
				await this.backup(raw);
				signal.throwIfAborted();
				const intent = {
					previousVersion: raw.version,
					candidateVersion,
					operation,
					status: "pending" as const,
				};
				await this.writeBinding({
					...this.binding.value,
					backupVersion: this.binding.value.originalVersion,
					intent,
				});
				signal.throwIfAborted();
				const committed = (await this.capabilities.call(
					"state.writeBinary",
					{
						root: this.root.handle,
						path: "ledger.sqlite",
						base64: Buffer.from(exported).toString("base64"),
						expectedVersion: raw.version,
						assertAbsent: sidecars,
					},
					signal,
				)) as PluginBinaryStateReadResult;
				if (
					committed.kind !== "value" ||
					committed.version !== candidateVersion
				)
					throw new InquiryRecoveryRequired(
						"Inquiry write has no verified candidate SHA readback",
					);
				signal.throwIfAborted();
				await this.writeBinding({
					...this.binding.value,
					headVersion: candidateVersion,
					intent: { ...intent, status: "committed" },
				});
				await this.current?.close();
				this.current = undefined;
				return result;
			});
		});
	}
	async reconcile(signal: AbortSignal) {
		return this.serialize(async () => {
			signal.throwIfAborted();
			await this.reserve();
			const intent = this.binding.value.intent;
			if (!intent || intent.status !== "pending")
				return { state: "no-pending-write" as const };
			const raw = await this.readRaw();
			const state =
				raw.version === intent.candidateVersion
					? "committed"
					: raw.version === intent.previousVersion
						? "not-committed"
						: null;
			if (!state)
				throw new InquiryRecoveryRequired(
					"Inquiry bytes match neither the previous nor the candidate SHA",
				);
			if (
				raw.kind === "value" &&
				this.engine.inspect(bytes(raw.base64)).projectId !==
					this.binding.value.projectId
			)
				throw new InquiryRecoveryRequired(
					"Recovered Inquiry bytes belong to another project",
				);
			signal.throwIfAborted();
			await this.writeBinding({
				...this.binding.value,
				headVersion: raw.version,
				intent: { ...intent, status: state },
			});
			await this.current?.close();
			this.current = undefined;
			return { state, version: raw.version };
		});
	}
	async restoreOriginal(signal: AbortSignal) {
		return this.serialize(async () => {
			signal.throwIfAborted();
			await this.reserve();
			if (this.binding.value.intent?.status === "pending")
				throw new InquiryRecoveryRequired(
					"Reconcile the pending write before restoring",
				);
			const version = this.binding.value.originalVersion;
			if (version === null)
				throw new Error("This Inquiry ledger had no original SQLite file");
			const backup = (await this.capabilities.call("state.readBinary", {
				root: this.root.handle,
				path: `ledger.sqlite.pre-plugin-${version}.bak`,
			})) as PluginBinaryStateReadResult;
			if (
				backup.kind !== "value" ||
				backup.version !== version ||
				this.engine.inspect(bytes(backup.base64)).projectId !==
					this.binding.value.projectId
			)
				throw new Error("Original Inquiry backup is missing or invalid");
			const raw = await this.readRaw();
			if (raw.version !== this.binding.value.headVersion)
				throw new InquiryRecoveryRequired(
					"Inquiry bytes changed before restore",
				);
			const intent = {
				previousVersion: raw.version,
				candidateVersion: version,
				operation: "restore-original",
				status: "pending" as const,
			};
			await this.writeBinding({ ...this.binding.value, intent });
			signal.throwIfAborted();
			const restored = (await this.capabilities.call(
				"state.writeBinary",
				{
					root: this.root.handle,
					path: "ledger.sqlite",
					base64: backup.base64,
					expectedVersion: raw.version,
					assertAbsent: sidecars,
				},
				signal,
			)) as PluginBinaryStateReadResult;
			if (restored.kind !== "value" || restored.version !== version)
				throw new InquiryRecoveryRequired(
					"Original Inquiry restore has no SHA readback",
				);
			signal.throwIfAborted();
			await this.writeBinding({
				...this.binding.value,
				headVersion: version,
				intent: { ...intent, status: "committed" },
			});
			await this.current?.close();
			this.current = undefined;
			return { restored: true, version };
		});
	}
	async dispose(): Promise<void> {
		this.stopped = true;
		await this.pending;
		if (this.cleanupFailure)
			throw new Error("Inquiry cleanup failed; writer lease must be retained", {
				cause: this.cleanupFailure,
			});
		await this.current?.close();
		this.current = undefined;
	}
}
