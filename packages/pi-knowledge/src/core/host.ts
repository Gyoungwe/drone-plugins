/**
 * Stable host entry point for the knowledge capability.
 *
 * The read port is deliberately dependency-free: Drone can discover it from
 * an installed package without importing the package's implementation into the
 * backend bundle. The rest of the host exports remain available during the
 * staged migration of write and lifecycle services.
 */
export * from "./index.js";

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readKnowledgeBinding } from "./config.js";
import { readNoteFile } from "./files.js";
import {
	containedVaultFile,
	createVaultFileOnly,
	replaceVaultFile,
	VaultFileConflictError,
} from "./layout.js";
import { DAILY_DISCOVERY_SYSTEM, buildDailyDiscoveryMessage, parseDailyIdeas } from "./daily-discovery-prompt.js";
import { recordTerminalJobExperience } from "./experience-store.js";
import { notifyKnowledgeUi, subscribeKnowledgeUi } from "./ui-state.js";
import { registerAnswerPublication } from "./publication.js";
import { ingestKnowledgeSnapshot, resolveKnowledgeContext } from "./reuse.js";
import { reviewWikiWithModel } from "./wiki-model-review.js";
import { BackgroundReviewer, type BackgroundReviewerOptions } from "./deliverable-review.js";
import {
	configureKnowledgeWorker,
	type KnowledgeWorkerMetadata,
} from "./runtime-host.js";

export interface KnowledgeDiscoveryNote {
	path: string;
	title: string;
	text: string;
	mtime: number;
}

export interface KnowledgeHostPort {
	readonly contractVersion: 1;
	overview(input: unknown): Promise<unknown>;
	search(input: unknown): Promise<unknown>;
	read(input: unknown): Promise<unknown>;
	noteLinks(input: unknown): Promise<unknown>;
	graph(input: unknown): Promise<unknown>;
	/** Optional review UI operations supplied by the installed knowledge host. */
	reviews?(input: unknown): Promise<unknown>;
	preview?(input: unknown): Promise<unknown>;
	decide?(input: unknown): Promise<unknown>;
	setupPreview?(input: unknown): Promise<unknown>;
	specialistSettings?(input: unknown): Promise<unknown>;
	openTarget?(input: unknown): Promise<unknown>;
	dailyDiscovery?: {
		systemPrompt: string;
		buildMessage(fresh: readonly KnowledgeDiscoveryNote[], related: readonly KnowledgeDiscoveryNote[]): string;
		parseIdeas(text: string, allowedPaths: Iterable<string>, freshPaths: Iterable<string>): unknown;
	};
	vault?: {
		readBinding(options?: { fresh?: boolean }): Promise<unknown>;
		readNote(vault: string, path: string): Promise<unknown>;
		containedFile(vault: string, path: string): Promise<string>;
		createFileOnly(path: string, content: string): Promise<boolean>;
		replaceFile(path: string, content: string, options: { expectedHash?: string }): Promise<void>;
		isConflict(error: unknown): boolean;
	};
	semantic?: {
		status(input: unknown): Promise<unknown>;
		saveSettings(input: unknown): Promise<unknown>;
		testProvider(input: unknown): Promise<unknown>;
		index(input: unknown): Promise<unknown>;
		cancelIndex(input: unknown): Promise<unknown>;
	};
	topics?: {
		list(input: unknown): Promise<unknown>;
		archive(input: unknown): Promise<unknown>;
	};
	memory?: {
		dailyContext(input: unknown): Promise<unknown>;
		saveIdea(input: unknown): Promise<unknown>;
		relatedForMemory(input: unknown): Promise<unknown>;
		saveMemory(input: unknown): Promise<unknown>;
	};
	researchResource?: {
		resolveContext(input: unknown): unknown;
		ingestSnapshot(input: unknown): unknown;
	};
	recordTerminalJobExperience?: (
		store: unknown,
		input: unknown,
		expectedRevision?: number,
	) => Promise<unknown>;
	uiState?: {
		subscribe(listener: (event: unknown) => void): () => void;
		notify(text: string, severity?: "info" | "warning" | "error", sessionId?: string | null): void;
	};
	registerAnswerPublication?: (
		pi: unknown,
		options: { getCurrent: () => unknown; evidenceOnly: boolean },
	) => { begin(required: boolean): unknown };
	reviewWikiWithModel?: (input: unknown, options: unknown) => Promise<unknown>;
	backgroundReviewer?: (options: unknown) => unknown;
	/** Optional UI operations are exposed incrementally as the host migrates. */
	jobs?(input: unknown): Promise<unknown>;
	maintenance?(input: unknown): Promise<unknown>;
}

export interface KnowledgeHostLoader {
	readonly contractVersion: 1;
	configureWorker?(setup: {
		createWorker(url: URL, options: Record<string, unknown>): unknown;
		workerMetadata?(): unknown;
	}): void;
	load(): KnowledgeHostPort;
}

/** Generic discovery export consumed by Drone's optional capability loader. */
export const knowledgeHostLoader: KnowledgeHostLoader = {
	contractVersion: 1,
	configureWorker: (setup) => {
		const workerUrl = packageKnowledgeWorkerUrl();
		configureKnowledgeWorker(
			(_requestedUrl, options) => setup.createWorker(workerUrl, options),
			() => resolvePackageWorkerResource(workerUrl).metadata,
		);
	},
	load: () => ({
		contractVersion: 1,
		overview: (input) => import("./ui-service.js").then(({ knowledgeOverview }) => knowledgeOverview(input as never)),
		search: (input) => import("./ui-service.js").then(({ searchKnowledge }) => searchKnowledge(input as never)),
		read: (input) => import("./ui-service.js").then(({ knowledgeReadNote }) => knowledgeReadNote(input as never)),
		noteLinks: (input) => import("./ui-service.js").then(({ knowledgeNoteLinks }) => knowledgeNoteLinks(input as never)),
		graph: (input) => import("./ui-service.js").then(({ knowledgeGraph }) => knowledgeGraph(input as never)),
		reviews: (input) => import("./ui-service.js").then(({ knowledgeReviews }) => knowledgeReviews(input as never)),
		preview: (input) =>
			import("./ui-service.js").then(({ knowledgePreviewReview }) => knowledgePreviewReview(input as never)),
		decide: (input) =>
			import("./ui-service.js").then(({ knowledgeDecideReview }) => knowledgeDecideReview(input as never)),
		setupPreview: (input) =>
			import("./ui-service.js").then(({ knowledgeSetupPreview }) => knowledgeSetupPreview(input as never)),
		specialistSettings: (input) =>
			import("./ui-service.js").then(({ knowledgeSpecialistSettings }) => knowledgeSpecialistSettings(input as never)),
		openTarget: (input) =>
			import("./ui-service.js").then(({ knowledgeOpenTarget }) => knowledgeOpenTarget(input as never)),
		dailyDiscovery: {
			systemPrompt: DAILY_DISCOVERY_SYSTEM,
			buildMessage: (fresh, related) => buildDailyDiscoveryMessage(fresh as never, related as never),
			parseIdeas: (text, allowedPaths, freshPaths) => parseDailyIdeas(text, allowedPaths, freshPaths),
		},
		vault: {
			readBinding: (options) => readKnowledgeBinding(options),
			readNote: (vault, path) => readNoteFile(vault, path),
			containedFile: (vault, path) => containedVaultFile(vault, path),
			createFileOnly: (path, content) => createVaultFileOnly(path, content),
			replaceFile: (path, content, options) => replaceVaultFile(path, content, options),
			isConflict: (error) => error instanceof VaultFileConflictError,
		},
		semantic: {
			status: (input) =>
				import("./ui-service.js").then(({ knowledgeSemanticStatus }) => knowledgeSemanticStatus(input as never)),
			saveSettings: (input) =>
				import("./ui-service.js").then(({ saveKnowledgeSemanticSettings }) => saveKnowledgeSemanticSettings(input as never)),
			testProvider: (input) =>
				import("./ui-service.js").then(({ testKnowledgeSemanticProvider }) => testKnowledgeSemanticProvider(input as never)),
			index: (input) =>
				import("./ui-service.js").then(({ indexKnowledgeSemantic }) => indexKnowledgeSemantic(input as never)),
			cancelIndex: (input) =>
				import("./ui-service.js").then(({ cancelKnowledgeSemanticIndex }) => cancelKnowledgeSemanticIndex(input as never)),
		},
		topics: {
			list: (input) => import("./ui-service.js").then(({ getKnowledgeTopics }) => getKnowledgeTopics(input as never)),
			archive: (input) =>
				import("./ui-service.js").then(({ archiveKnowledgeTopic }) => archiveKnowledgeTopic(input as never)),
		},
		memory: {
			dailyContext: (input) => import("./ui-service.js").then(({ dailyDiscoveryContext }) => dailyDiscoveryContext(input as never)),
			saveIdea: (input) => import("./ui-service.js").then(({ saveDiscoveryIdea }) => saveDiscoveryIdea(input as never)),
			relatedForMemory: (input) =>
				import("./ui-service.js").then(({ memoryRelatedKnowledge }) => memoryRelatedKnowledge(input as never)),
			saveMemory: (input) => import("./ui-service.js").then(({ saveMemoryNote }) => saveMemoryNote(input as never)),
		},
		researchResource: {
			resolveContext: (input) => resolveKnowledgeContext(input as never),
			ingestSnapshot: (input) => ingestKnowledgeSnapshot(input as never),
		},
		recordTerminalJobExperience: (store, input, expectedRevision) =>
			recordTerminalJobExperience(store as never, input as never, expectedRevision),
		uiState: {
			subscribe: (listener) => subscribeKnowledgeUi(listener as never),
			notify: (text, severity, sessionId) => notifyKnowledgeUi(text, severity, sessionId ?? null),
		},
		registerAnswerPublication: (pi, options) => registerAnswerPublication(pi, options),
		reviewWikiWithModel: (input, options) => reviewWikiWithModel(input, options as never),
		backgroundReviewer: (options: unknown) => new BackgroundReviewer(options as BackgroundReviewerOptions),
		jobs: (input) => import("./ui-service.js").then(({ knowledgeJobs }) => knowledgeJobs(input as never)),
		maintenance: (input) =>
			import("./ui-service.js").then(({ knowledgeMaintenance }) => knowledgeMaintenance(input as never)),
	}),
};

function packageKnowledgeWorkerUrl(): URL {
	const candidates = [
		new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url),
		new URL("../../lib/knowledge/runtime/worker.mjs", import.meta.url),
		...(process.env.DRONE_RESEARCH_WORKBENCH_ROOT
			? [
					pathToFileURL(
						join(
							process.env.DRONE_RESEARCH_WORKBENCH_ROOT,
							"..",
							"pi-packages/node_modules/@gyoungwe/pi-knowledge/lib/knowledge/runtime/worker.mjs",
						),
					),
				]
				: []),
		...new Set(
			[process.cwd(), process.env.PWD, process.env.INIT_CWD]
				.filter((directory): directory is string => Boolean(directory))
			.flatMap((directory) => ancestorNodeModuleWorkerCandidates(directory)),
		),
	];
	const found = candidates.find((candidate) => candidate.protocol === "file:" && existsSync(fileURLToPath(candidate)));
	if (!found) throw new Error("Knowledge worker resource is missing from the installed pi-knowledge package");
	return found;
}

function ancestorNodeModuleWorkerCandidates(startDirectory: string): URL[] {
	const candidates: URL[] = [];
	let directory = startDirectory;
	while (true) {
		candidates.push(pathToFileURL(join(directory, "node_modules/@gyoungwe/pi-knowledge/lib/knowledge/runtime/worker.mjs")));
		const parent = dirname(directory);
		if (parent === directory) return candidates;
		directory = parent;
	}
}

/** Resolve the package-owned worker entry for host-side extension adapters. */
export function resolveKnowledgePackageWorkerUrl(): URL {
	return packageKnowledgeWorkerUrl();
}

/** Verify and return metadata for the package-owned worker artifact. */
export function resolveKnowledgePackageWorkerMetadata(): KnowledgeWorkerMetadata {
	return resolvePackageWorkerResource(packageKnowledgeWorkerUrl()).metadata;
}

function resolvePackageWorkerResource(url: URL): {
	metadata: KnowledgeWorkerMetadata;
} {
	if (url.protocol !== "file:") throw new Error(`Knowledge worker URL must use file: protocol: ${url.href}`);
	const path = fileURLToPath(url);
	const manifestPath = join(dirname(path), ".knowledge-worker-manifest.json");
	if (!existsSync(path)) throw new Error(`Knowledge worker resource is missing from the package: ${path}`);
	if (!existsSync(manifestPath)) throw new Error(`Knowledge worker manifest is missing from the package: ${manifestPath}`);
	let manifest: Record<string, unknown>;
	try {
		manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
	} catch (error) {
		throw new Error(`Knowledge worker manifest is invalid: ${manifestPath}`, { cause: error });
	}
	const expected = typeof manifest.outputSha256 === "string" ? manifest.outputSha256 : "";
	if (!/^[a-f0-9]{64}$/u.test(expected))
		throw new Error(`Knowledge worker manifest has no valid output hash: ${manifestPath}`);
	const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
	if (actual !== expected) throw new Error(`Knowledge worker resource hash mismatch: ${path}`);
	const version = `${typeof manifest.version === "number" || typeof manifest.version === "string" ? manifest.version : "1"}:${expected.slice(0, 16)}`;
	return { metadata: { version, source: path, integrity: expected } };
}
