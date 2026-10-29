/** Host seams used by knowledge runtime modules.
 *
 * The domain package owns the stateful implementation; desktop/CLI hosts inject
 * process event and runtime scheduling adapters at composition time. Defaults
 * are deterministic and safe for read-only package use and tests.
 */
export type RuntimeExclusive = <T>(namespace: string, key: string, work: () => Promise<T>) => Promise<T>;
export type ProcessEventEmitter = (event: string, payload?: unknown) => void;
export type RuntimeSlotProvider = <T extends object>(domain: string, slot: string, create: () => T) => T;
export type ToolMetadataLookup = (toolName: string) => unknown;
export type FlowCardBuilder = (toolName: string) => unknown;
export type DeliveryContract = (prompt: string, options?: Record<string, unknown>) => unknown;
export function diagnosticText(value: unknown, limit = 4096): string {
	if (typeof value !== "string" && typeof value !== "number") return "";
	return String(value)
		.slice(0, 8192)
		.replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
			try { const url = new URL(raw); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.toString(); }
			catch { return "[URL omitted]"; }
		})
		.replace(/(?:bearer\s+)[^\s,;"']+/gi, "Bearer [redacted]")
		.replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie)["']?\s*[=:]\s*)(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s,;]+)/gi, "$1[redacted]")
		.replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}/g, "[redacted]")
		.replace(/[\u0000-\u001f\u007f<>]/g, " ")
		.slice(0, Math.max(0, limit));
}

export type KnowledgeWorkerFactory = (url: URL, options: Record<string, unknown>) => unknown;
export interface KnowledgeWorkerMetadata {
	/** Human-readable worker artifact version (usually a build manifest hash). */
	readonly version: string;
	/** Absolute or package-relative resource path, when the host can disclose it. */
	readonly source?: string;
	/** SHA-256 of the exact worker bytes, when available. */
	readonly integrity?: string;
}
export type KnowledgeWorkerMetadataProvider = () => KnowledgeWorkerMetadata;

export const KNOWLEDGE_WORKER_LIFECYCLE_EVENT = "drone:knowledge-worker-lifecycle/v1";
export type KnowledgeWorkerLifecycleStage =
	| "staged"
	| "verified"
	| "enabled"
	| "disabled"
	| "drained"
	| "reloaded"
	| "rolled_back";
export interface KnowledgeWorkerLifecycleEvent {
	readonly stage: KnowledgeWorkerLifecycleStage;
	readonly version: string;
	readonly previousVersion?: string;
	readonly source?: string;
	readonly integrity?: string;
	readonly reason?: string;
	readonly pendingRequests?: number;
	readonly at: string;
}

export type WorkspaceConfigLoader = (cwd: string) => Promise<Record<string, unknown>>;
export type ExplainerPublisher = (input: Record<string, unknown>) => Promise<unknown>;

export type LayoutDefinition = { templates: Record<string, string>; noteTemplate: string };

/** One application owner: callbacks, slots and locks never cross instances. */
export function createKnowledgeRuntimeHost() {
	const locks = new Map<string, Promise<void>>();
	const defaultRunRuntimeExclusive: RuntimeExclusive = async <T>(namespace: string, key: string, work: () => Promise<T>) => {
		const lockKey = JSON.stringify([namespace, key]);
		const previous = locks.get(lockKey) ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tail = previous.then(() => current);
		locks.set(lockKey, tail);
		await previous;
		try {
			return await work();
		} finally {
			release();
			if (locks.get(lockKey) === tail) locks.delete(lockKey);
		}
	};

	let runtimeExclusive: RuntimeExclusive = defaultRunRuntimeExclusive;
	let processEvent: ProcessEventEmitter = () => undefined;
	let metadataLookup: ToolMetadataLookup = () => null;
	let cardBuilderLookup: FlowCardBuilder = () => null;
	let deliveryLookup: DeliveryContract = () => null;
	let hostSlotProvider: RuntimeSlotProvider | undefined;

	function configureKnowledgeRuntime(host: {
		runRuntimeExclusive?: RuntimeExclusive;
		emitProcessEvent?: ProcessEventEmitter;
		toolMeta?: ToolMetadataLookup;
		flowCardBuilder?: FlowCardBuilder;
		deliveryContract?: DeliveryContract;
		runtimeSlot?: RuntimeSlotProvider;
	} = {}): void {
		// Multiple compatibility adapters can load in one process. Merge seams
		// instead of resetting a previously installed host registry when another
		// adapter (for example the service worker) initializes later.
		if (host.runRuntimeExclusive) runtimeExclusive = host.runRuntimeExclusive;
		if (host.emitProcessEvent) processEvent = host.emitProcessEvent;
		if (host.toolMeta) metadataLookup = host.toolMeta;
		if (host.flowCardBuilder) cardBuilderLookup = host.flowCardBuilder;
		if (host.deliveryContract) deliveryLookup = host.deliveryContract;
		if (host.runtimeSlot) hostSlotProvider = host.runtimeSlot;
	}

	const runRuntimeExclusive: RuntimeExclusive = (namespace, key, work) =>
		runtimeExclusive(namespace, key, work);
	const emitProcessEvent: ProcessEventEmitter = (event, payload) => processEvent(event, payload);

	const slots = new Map<string, object>();
	/** Resolve each operation through the host's current async runtime, including
	 * modules loaded before the host installs its adapter. */
	function runtimeSlot<T extends object>(domain: string, key: string, factory: () => T): T {
		let hostProxy: T | undefined;
		let provider: RuntimeSlotProvider | undefined;
		const resolve = (): T => {
			if (hostSlotProvider) {
				if (provider !== hostSlotProvider) {
					provider = hostSlotProvider;
					hostProxy = provider(domain, key, factory);
				}
				return hostProxy as T;
			}
			const slotKey = `${domain}:${key}`;
			if (!slots.has(slotKey)) slots.set(slotKey, factory());
			return slots.get(slotKey) as T;
		};
		return new Proxy({} as T, {
			get: (_target, property) => {
				const state = resolve();
				const value = Reflect.get(state, property);
				return typeof value === "function" ? value.bind(state) : value;
			},
			set: (_target, property, value) => Reflect.set(resolve(), property, value),
			ownKeys: () => Reflect.ownKeys(resolve()),
			getOwnPropertyDescriptor: (_target, property) => {
				const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), property);
				return descriptor ? { ...descriptor, configurable: true } : undefined;
			},
		});
	}
	function toolMeta(_toolName: string): unknown {
		return metadataLookup(_toolName);
	}
	function flowCardBuilder(_toolName: string): unknown {
		return cardBuilderLookup(_toolName);
	}
	let workerFactory: KnowledgeWorkerFactory = (url, options) => {
		throw new Error(`Knowledge worker host is not configured for ${url.href}`);
	};
	let workerMetadataProvider: KnowledgeWorkerMetadataProvider = () => ({ version: "unknown" });
	/**
	 * Install the worker factory used by the domain service.  Hosts may also
	 * provide a lazy metadata reader: packaged hosts select their resource root
	 * after this module is imported, so resolving the manifest eagerly would
	 * accidentally pin the development path.
	 */
	function configureKnowledgeWorker(
		factory: KnowledgeWorkerFactory,
		metadata?: KnowledgeWorkerMetadataProvider,
	): void {
		if (typeof factory !== "function") throw new TypeError("Knowledge worker host must provide a factory");
		workerFactory = factory;
		if (metadata) workerMetadataProvider = metadata;
	}
	function createKnowledgeWorker(url: URL, options: Record<string, unknown>): unknown {
		return workerFactory(url, options);
	}
	function knowledgeWorkerMetadata(): KnowledgeWorkerMetadata {
		// Package hosts verify their selected resource here. A failed verification
		// must reach the pool before it drains the currently usable SQLite writer.
		const value = workerMetadataProvider();
		return {
			version: value.version.slice(0, 200),
			...(value.source === undefined ? {} : { source: value.source.slice(0, 1000) }),
			...(value.integrity === undefined ? {} : { integrity: value.integrity.slice(0, 200) }),
		};
	}
	/** Emit bounded, metadata-only lifecycle evidence through the host seam. */
	function emitKnowledgeWorkerLifecycle(
		stage: KnowledgeWorkerLifecycleStage,
		partial: Omit<KnowledgeWorkerLifecycleEvent, "stage" | "at">,
	): void {
		emitProcessEvent(KNOWLEDGE_WORKER_LIFECYCLE_EVENT, {
			stage,
			...partial,
			at: new Date().toISOString(),
		});
	}
	function configureKnowledgeEvidence(host: {
		requiresPaperEvidence?: (query: string) => boolean;
		hasPaperCitation?: (sources: unknown[]) => boolean;
	}): void {
		if (host.requiresPaperEvidence) requiresPaperEvidence = host.requiresPaperEvidence;
		if (host.hasPaperCitation) hasPaperCitation = host.hasPaperCitation;
	}
	let requiresPaperEvidence = (query: string) => /paper|literature|article|文献|论文/i.test(query);
	let hasPaperCitation = (sources: unknown[]) =>
		Array.isArray(sources) &&
			sources.some((source) => {
				const value = source as { paperDois?: unknown };
				return Array.isArray(value?.paperDois) && value.paperDois.some((doi) => /^10\.\d{4,9}\//i.test(String(doi)));
			});

	const deliveryContract: DeliveryContract = (prompt, options) => deliveryLookup(prompt, options);
	let workspaceConfigLoader: WorkspaceConfigLoader = async () => { throw new Error("Workspace config host is not configured"); };
	let explainerPublisher: ExplainerPublisher = async () => { throw new Error("Explainer publisher host is not configured"); };
	let reviewPreviewConsumer: (cwd: string, token: string) => unknown = () => null;
	let specialistSettingsReader: () => Promise<Record<string, unknown>> = async () => ({ mode: "strict" });
	function configureKnowledgeHost(host: {
		loadWorkspaceConfig?: WorkspaceConfigLoader;
		publishExplainer?: ExplainerPublisher;
		consumeKnowledgeReviewPreview?: (cwd: string, token: string) => unknown;
		specialistSettings?: () => Promise<Record<string, unknown>>;
	} = {}): void {
		if (host.loadWorkspaceConfig) workspaceConfigLoader = host.loadWorkspaceConfig;
		if (host.publishExplainer) explainerPublisher = host.publishExplainer;
		if (host.consumeKnowledgeReviewPreview) reviewPreviewConsumer = host.consumeKnowledgeReviewPreview;
		if (host.specialistSettings) specialistSettingsReader = host.specialistSettings;
	}
	const loadWorkspaceConfig: WorkspaceConfigLoader = (cwd) => workspaceConfigLoader(cwd);
	const publishExplainer: ExplainerPublisher = (input) => explainerPublisher(input);
	const consumeKnowledgeReviewPreview = (cwd: string, token: string) => reviewPreviewConsumer(cwd, token);
	const specialistSettings = () => specialistSettingsReader();
	let layoutDefinition: LayoutDefinition = { templates: {}, noteTemplate: "" };
	let obsidianSetupInspector: (input: Record<string, unknown>) => Promise<unknown> = async () => null;
	let setupDirectoryInspector: (vault: string) => Promise<unknown> = async () => null;
	let setupVaultResolver: (supplied: string, workspace: string) => string = (supplied) => supplied;
	let setupOptionsReader: () => unknown = () => [];
	function configureKnowledgeSetup(host: {
		layout?: LayoutDefinition;
		inspectObsidianSetup?: (input: Record<string, unknown>) => Promise<unknown>;
		inspectSetupDirectory?: (vault: string) => Promise<unknown>;
		resolveSetupVault?: (supplied: string, workspace: string) => string;
		researchSetupOptions?: () => unknown;
	} = {}): void {
		if (host.layout) layoutDefinition = host.layout;
		if (host.inspectObsidianSetup) obsidianSetupInspector = host.inspectObsidianSetup;
		if (host.inspectSetupDirectory) setupDirectoryInspector = host.inspectSetupDirectory;
		if (host.resolveSetupVault) setupVaultResolver = host.resolveSetupVault;
		if (host.researchSetupOptions) setupOptionsReader = host.researchSetupOptions;
	}
	const LAYOUT: LayoutDefinition = new Proxy({} as LayoutDefinition, {
		get: (_target, key) => layoutDefinition[key as keyof LayoutDefinition],
	});
	const inspectObsidianSetup = (input: Record<string, unknown>) => obsidianSetupInspector(input);
	const inspectSetupDirectory = (vault: string) => setupDirectoryInspector(vault);
	const resolveSetupVault = (supplied: string, workspace: string) => setupVaultResolver(supplied, workspace);
	const researchSetupOptions = () => setupOptionsReader();
	return {
		configureKnowledgeRuntime,
		runRuntimeExclusive,
		emitProcessEvent,
		runtimeSlot,
		toolMeta,
		flowCardBuilder,
		configureKnowledgeWorker,
		createKnowledgeWorker,
		knowledgeWorkerMetadata,
		emitKnowledgeWorkerLifecycle,
		configureKnowledgeEvidence,
		deliveryContract,
		configureKnowledgeHost,
		loadWorkspaceConfig,
		publishExplainer,
		consumeKnowledgeReviewPreview,
		specialistSettings,
		configureKnowledgeSetup,
		LAYOUT,
		inspectObsidianSetup,
		inspectSetupDirectory,
		resolveSetupVault,
		researchSetupOptions,
		requiresPaperEvidence: (query: string) => requiresPaperEvidence(query),
		hasPaperCitation: (sources: unknown[]) => hasPaperCitation(sources),
	};
}

export type KnowledgeRuntimeHost = ReturnType<typeof createKnowledgeRuntimeHost>;

// pi-knowledge 0.2 compatibility. Delete after all native/Desktop consumers use
// the same explicitly composed 0.3 runtime owner instead of module facades.
export const compatibilityKnowledgeRuntimeHost = createKnowledgeRuntimeHost();
export const {
	configureKnowledgeRuntime,
	runRuntimeExclusive,
	emitProcessEvent,
	runtimeSlot,
	toolMeta,
	flowCardBuilder,
	configureKnowledgeWorker,
	createKnowledgeWorker,
	knowledgeWorkerMetadata,
	emitKnowledgeWorkerLifecycle,
	configureKnowledgeEvidence,
	deliveryContract,
	configureKnowledgeHost,
	loadWorkspaceConfig,
	publishExplainer,
	consumeKnowledgeReviewPreview,
	specialistSettings,
	configureKnowledgeSetup,
	LAYOUT,
	inspectObsidianSetup,
	inspectSetupDirectory,
	resolveSetupVault,
	researchSetupOptions,
	requiresPaperEvidence,
	hasPaperCitation,
} = compatibilityKnowledgeRuntimeHost;
