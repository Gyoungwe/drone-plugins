import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Worker } from "node:worker_threads";
import type { KnowledgeBinding } from "./config.js";
import type {
	KnowledgeRuntimeHost,
	KnowledgeWorkerLifecycleStage,
	KnowledgeWorkerMetadata,
} from "./runtime-host.js";
import type { KnowledgeConfigApi } from "./config.js";
import type { acquireKnowledgeWriterLease } from "./writer-lease.js";
import type {
	KnowledgeServiceTransport,
	KnowledgeServiceTransportFactory,
} from "./service-transport.js";

/** CLI adapter: all Worker protocol, process liveness and SQLite lease ownership live here. */
export function createKnowledgeWorkerTransportFactory(
	runtime: KnowledgeRuntimeHost,
	config: Pick<KnowledgeConfigApi, "knowledgeDirectory">,
	invalidateKnowledgeUi: () => void,
	acquireWriterLease: typeof acquireKnowledgeWriterLease | null,
): KnowledgeServiceTransportFactory {
	const {
		createKnowledgeWorker,
		knowledgeWorkerMetadata,
		emitKnowledgeWorkerLifecycle,
	} = runtime;
	class KnowledgeWorkerTransport implements KnowledgeServiceTransport {
		private pending: Map<
			number,
			{
				resolve(value: unknown): void;
				reject(error: unknown): void;
				timer: ReturnType<typeof setTimeout>;
			}
		>;
		private inFlightRequests: number;
		private next: number;
		closed: boolean;
		closing: boolean;
		private closePromise: Promise<void> | null;
		readonly metadata: KnowledgeWorkerMetadata;
		readonly version: string;
		lifecycle: KnowledgeWorkerLifecycleStage;
		private readyPromise: Promise<{ version: string }>;
		private ready: boolean;
		private writerLease:
			| ReturnType<typeof acquireKnowledgeWriterLease>
			| undefined;
		private leaseReleaseError: unknown;
		private workerFailure: unknown;
		private worker: Worker;
		constructor(
			binding: KnowledgeBinding,
			directory: string,
			options: { workerVersion?: string },
		) {
			this.pending = new Map();
			this.inFlightRequests = 0;
			this.next = 0;
			this.closed = false;
			this.closing = false;
			this.closePromise = null;
			this.metadata = knowledgeWorkerMetadata();
			this.version =
				typeof options.workerVersion === "string" && options.workerVersion
					? options.workerVersion.slice(0, 200)
					: this.metadata.version;
			this.lifecycle = "staged";
			let readyResolve!: (value: { version: string }) => void;
			let readyReject!: (error: unknown) => void;
			this.readyPromise = new Promise((resolve, reject) => {
				readyResolve = resolve;
				readyReject = reject;
			});
			// A service may be staged by a host health-check and then discarded. Keep
			// the rejected handshake observed so a failed candidate cannot surface as
			// an unhandled rejection in a caller that only inspects lifecycle events.
			this.readyPromise.catch(() => undefined);
			this.ready = false;
			const workerOptions = {
				workerData: {
					vault: binding.vault,
					database: join(directory, binding.vaultId, "index.sqlite"),
					workerVersion: this.version,
				},
				execArgv: process.execArgv.filter(
					(arg) => !arg.startsWith("--input-type") && !arg.startsWith("--test"),
				),
			};
			mkdirSync(dirname(workerOptions.workerData.database), {
				recursive: true,
			});
			// The 0.2 compatibility pool opts out until native/Desktop lifetimes
			// share an owner; otherwise normal CLI unref exit would leave a lease.
			this.writerLease = acquireWriterLease?.({
				vault: binding.vault,
				indexPath: workerOptions.workerData.database,
			});
			this.leaseReleaseError = null;
			this.workerFailure = null;

			try {
				this.worker = createKnowledgeWorker(
					new URL("./worker.mjs", import.meta.url),
					workerOptions,
				) as Worker;
			} catch (error) {
				this.writerLease?.release();
				this.closed = true;
				this.lifecycle = "disabled";
				readyReject(error);
				emitKnowledgeWorkerLifecycle("disabled", {
					version: this.version,
					source: this.metadata.source,
					integrity: this.metadata.integrity,
					reason: String(error instanceof Error ? error.message : error).slice(
						0,
						400,
					),
				});
				throw error;
			}
			const fail = (error: unknown) => {
				this.workerFailure ??= error;
				if (!this.ready) readyReject(error);
				this.closed = true;
				this.lifecycle = "disabled";
				for (const item of this.pending.values()) {
					clearTimeout(item.timer);
					item.reject(error);
				}
				this.pending.clear();
				this.worker.unref();
				emitKnowledgeWorkerLifecycle("disabled", {
					version: this.version,
					source: this.metadata.source,
					integrity: this.metadata.integrity,
					reason: String(error instanceof Error ? error.message : error).slice(
						0,
						400,
					),
				});
			};
			this.worker.on("message", (message) => {
				if (message.ready) {
					this.ready = true;
					this.lifecycle = "verified";
					readyResolve({ version: this.version });
					emitKnowledgeWorkerLifecycle("verified", {
						version: this.version,
						source: this.metadata.source,
						integrity: this.metadata.integrity,
					});
					if (!this.pending.size) this.worker.unref();
					return;
				}
				if (message.uiChanged) {
					invalidateKnowledgeUi();
					return;
				}
				const item = this.pending.get(message.id);
				if (!item) return;
				clearTimeout(item.timer);
				this.pending.delete(message.id);
				if (!this.pending.size) this.worker.unref();
				if (message.error) item.reject(new Error(message.error));
				else item.resolve(message.result);
			});
			this.worker.on("error", fail);
			this.worker.on("exit", (code) => {
				// The exit event is the first point at which SQLite handles are gone.
				try {
					this.writerLease?.release();
				} catch (error) {
					// An event callback cannot reject close() directly. Keep the failure
					// for close(), report disabled, and leave the changed lease untouched.
					this.leaseReleaseError = error;
					fail(error);
				}
				if (code !== 0 || (!this.closed && !this.closing))
					fail(new Error(`Knowledge worker exited (${code})`));
			});
			emitKnowledgeWorkerLifecycle("staged", {
				version: this.version,
				source: this.metadata.source,
				integrity: this.metadata.integrity,
			});
			// Keep the worker referenced until its ready handshake. Once verified,
			// idle workers are unref'ed and only active requests keep the process alive.
		}
		async waitUntilReady() {
			if (this.ready) return { version: this.version };
			if (this.closed) throw new Error("Knowledge worker failed to initialize");
			return this.readyPromise;
		}
		request(op: string, args: Record<string, unknown> = {}): Promise<unknown> {
			if (this.closed || (this.closing && op !== "close"))
				return Promise.reject(new Error("Knowledge service is closed"));
			const post = () => {
				if (this.closed)
					return Promise.reject(new Error("Knowledge service is closed"));
				const id = ++this.next;
				this.worker.ref();
				return new Promise<unknown>((resolvePromise, reject) => {
					const timer = setTimeout(
						() => {
							this.pending.delete(id);
							if (!this.pending.size) this.worker.unref();
							reject(
								new Error(
									`Knowledge ${op} timed out; it was not reported as a successful empty result`,
								),
							);
						},
						op === "reconcile" ? 120000 : 20000,
					);
					this.pending.set(id, { resolve: resolvePromise, reject, timer });
					this.worker.postMessage({ id, op, args });
				});
			};
			// Count requests before waiting for the ready handshake so close() cannot
			// overtake an accepted operation that has not posted its worker message yet.
			if (op === "close") return post();
			this.inFlightRequests += 1;
			return this.waitUntilReady()
				.then(post)
				.finally(() => {
					this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);
				});
		}
		close() {
			if (this.closePromise) return this.closePromise;
			this.closing = true;
			this.lifecycle = "disabled";
			emitKnowledgeWorkerLifecycle("disabled", {
				version: this.version,
				previousVersion: this.version,
				source: this.metadata.source,
				integrity: this.metadata.integrity,
				pendingRequests: this.pending.size,
			});
			this.closePromise = (async () => {
				let drainFailure: unknown = null;
				const exited = new Promise<void>((resolve) => {
					if (this.worker.threadId === -1) resolve();
					else this.worker.once("exit", resolve);
				});
				try {
					// Let requests accepted just before close() finish their ready
					// handshake and enqueue before we begin waiting for the queue to drain.
					if (!this.closed) await this.waitUntilReady();
					// Drain requests already accepted before close() was called. A close
					// message sent ahead of them lets the worker exit first and turns an
					// in-flight reconcile into a misleading "worker is closing" error.
					while (!this.closed && (this.pending.size || this.inFlightRequests))
						await new Promise((resolve) => setTimeout(resolve, 10));
					if (!this.closed) await this.request("close");
				} catch (error) {
					// Cleanup still joins failed workers, but cannot claim graceful drain.
					drainFailure = error;
					await this.worker.terminate();
				} finally {
					this.closed = true;
					for (const item of this.pending.values()) {
						clearTimeout(item.timer);
						item.reject(new Error("Knowledge service closed"));
					}
					this.pending.clear();
					this.worker.ref();
					const fallback = setTimeout(() => {
						drainFailure = new Error(
							"Knowledge worker required forced termination; drain did not complete",
						);
						void this.worker.terminate();
					}, 5000);
					try {
						await exited;
					} finally {
						clearTimeout(fallback);
					}
					if (this.leaseReleaseError) throw this.leaseReleaseError;
					if (drainFailure) {
						emitKnowledgeWorkerLifecycle("disabled", {
							version: this.version,
							reason: String(
								drainFailure instanceof Error
									? drainFailure.message
									: drainFailure,
							).slice(0, 400),
						});
						throw drainFailure;
					}
					if (this.workerFailure) throw this.workerFailure;
					emitKnowledgeWorkerLifecycle("drained", {
						version: this.version,
						source: this.metadata.source,
						integrity: this.metadata.integrity,
					});
				}
			})();
			return this.closePromise;
		}
		prepareUnload() {
			if (this.closing || this.closed)
				return { pendingRequests: this.pending.size, version: this.version };
			this.closing = true;
			return { pendingRequests: this.pending.size, version: this.version };
		}
		get pendingRequestCount() {
			return this.pending.size;
		}
	}
	function directory() {
		const value = config.knowledgeDirectory();
		if (!value) throw new Error("No application knowledge directory");
		return value;
	}
	return {
		metadata: knowledgeWorkerMetadata,
		resourceKey: binding => join(directory(), binding.vaultId, "index.sqlite"),
		create: ({ binding, workerVersion }) =>
			new KnowledgeWorkerTransport(binding, directory(), { workerVersion }),
	};
}
