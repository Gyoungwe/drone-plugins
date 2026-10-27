import { createHash } from "node:crypto";

export type ResearchConnectorKind =
	| "literature"
	| "citation"
	| "dataset"
	| "protocol"
	| "institutional"
	| "project-storage";

export interface ResearchConnectorContext {
	readonly cwd?: string;
	readonly signal?: AbortSignal;
	readonly config?: Readonly<Record<string, unknown>>;
}

export interface ResearchProjectStorageItem {
	readonly relativePath: string;
	readonly title?: string;
	readonly summary?: string;
	readonly format?: string;
	readonly size?: number;
	readonly modifiedAt?: string;
	readonly contentHash?: string;
}

export interface ResearchProjectStoragePort {
	search(input: {
		readonly cwd: string;
		readonly query: string;
		readonly limit: number;
		readonly signal?: AbortSignal;
	}): Promise<readonly ResearchProjectStorageItem[]>;
}

export interface ResearchConnectorDescriptor {
	readonly id: string;
	readonly kind: ResearchConnectorKind;
	readonly label: string;
	readonly enabled: true;
}

export interface ResearchConnectorSourceReceipt {
	readonly sourceRef: string;
	readonly locator: string;
	readonly sourceType: ResearchConnectorKind;
	readonly title?: string;
	readonly version?: string;
	readonly license?: string;
	readonly accessedAt: string;
	readonly contentHash: string;
	readonly readOnly: true;
}

export interface ResearchConnectorHit {
	readonly id: string;
	readonly title: string;
	readonly summary: string;
	readonly locator: string;
	readonly sourceType: ResearchConnectorKind;
	readonly sourceReceipt: ResearchConnectorSourceReceipt;
	readonly authors?: readonly string[];
	readonly year?: number;
	readonly doi?: string;
	readonly publishedAt?: string;
	readonly arxivId?: string;
}

export interface ResearchConnectorFailure {
	readonly connectorId: string;
	readonly message: string;
	readonly retryable: boolean;
	readonly at: string;
}

export interface ResearchSearchRequest {
	readonly query: string;
	readonly cwd?: string;
	readonly connectorIds?: readonly string[];
	readonly limit?: number;
	readonly signal?: AbortSignal;
}

export interface ResearchSearchResponse {
	readonly query: string;
	readonly hits: readonly ResearchConnectorHit[];
	readonly failures: readonly ResearchConnectorFailure[];
	readonly connectors: readonly string[];
	readonly complete: boolean;
}

interface ConnectorOptions extends ResearchConnectorContext {
	readonly limit?: number;
}

interface ResearchConnector {
	readonly descriptor: ResearchConnectorDescriptor;
	search(query: string, options: ConnectorOptions): Promise<readonly ResearchConnectorHit[]>;
	recommend?(seed: string, options: ConnectorOptions): Promise<readonly ResearchConnectorHit[]>;
}

export interface ResearchConnectorHostAdapter {
	readonly contractVersion: 1;
	readonly status: "ready" | "degraded" | "unavailable";
	readonly list: () => readonly ResearchConnectorDescriptor[];
	readonly recommend: (
		seed: string,
		connectorId: string,
		context?: ResearchConnectorContext,
		limit?: number,
	) => Promise<{ readonly hits: readonly ResearchConnectorHit[]; readonly failures: readonly ResearchConnectorFailure[] }>;
	readonly search: (
		input: ResearchSearchRequest,
		context?: ResearchConnectorContext,
	) => Promise<ResearchSearchResponse>;
}

export interface ResearchConnectorHostLoader {
	readonly contractVersion: 1;
	readonly load: () => ResearchConnectorHostAdapter;
}

export interface ResearchConnectorHostOptions {
	/** Host-owned transport. The plugin never creates a client or stores credentials. */
	readonly fetchImpl?: typeof fetch;
	/** Host-owned project index. Paths and workspace authorization stay in the host. */
	readonly projectStorage?: ResearchProjectStoragePort;
}

const DEFAULT_TIMEOUT_MS = 12_000;

function hash(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isoNow(): string {
	return new Date().toISOString();
}

function clampLimit(value: number | undefined): number {
	return Math.max(1, Math.min(50, Math.trunc(value ?? 10)));
}

function text(value: unknown): string {
	return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function record(value: unknown): Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" ? (value as Readonly<Record<string, unknown>>) : {};
}

function receipt(input: {
	readonly sourceRef: string;
	readonly locator: string;
	readonly kind: ResearchConnectorKind;
	readonly title?: string;
	readonly payload: unknown;
}): ResearchConnectorSourceReceipt {
	return {
		sourceRef: input.sourceRef,
		locator: input.locator,
		sourceType: input.kind,
		title: input.title,
		accessedAt: isoNow(),
		contentHash: hash(input.payload),
		readOnly: true,
	};
}

function retryable(error: unknown): boolean {
	const status =
		typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 0;
	return status === 408 || status === 429 || status >= 500 || status === 0;
}

function failure(connectorId: string, error: unknown): ResearchConnectorFailure {
	return {
		connectorId,
		message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
		retryable: retryable(error),
		at: isoNow(),
	};
}

async function fetchJson(
	fetchImpl: typeof fetch,
	url: string,
	options: ResearchConnectorContext,
	extraHeaders: Readonly<Record<string, string>> = {},
): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
	const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
	try {
		const response = await fetchImpl(url, {
			headers: {
				accept: "application/json",
				"user-agent": "Drone-Research-Workbench/0.33",
				...extraHeaders,
			},
			signal,
		});
		if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
		return await response.json();
	} finally {
		clearTimeout(timer);
	}
}

async function fetchText(fetchImpl: typeof fetch, url: string, options: ResearchConnectorContext): Promise<string> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
	const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
	try {
		const response = await fetchImpl(url, {
			headers: { accept: "application/atom+xml,application/xml,text/xml", "user-agent": "Drone-Research-Workbench/0.33" },
			signal,
		});
		if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
		return await response.text();
	} finally {
		clearTimeout(timer);
	}
}

function bibliographicAuthors(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.flatMap((author) => {
					const name = text(record(author).name);
					return name ? [name] : [];
				})
		: [];
}

function semanticScholarHit(item: unknown): ResearchConnectorHit[] {
	const value = record(item);
	const paperId = text(value.paperId) || text(value.corpusId);
	const title = text(value.title);
	if (!paperId || !title) return [];
	const externalIds = record(value.externalIds);
	const doi = text(externalIds.DOI) || undefined;
	const locator = doi ? `https://doi.org/${doi}` : text(value.url) || `https://www.semanticscholar.org/paper/${paperId}`;
	return [
		{
			id: `semantic-scholar:${paperId}`,
			title,
			summary: text(value.abstract) || text(value.venue) || "Semantic Scholar record",
			locator,
			sourceType: "literature",
			authors: bibliographicAuthors(value.authors),
			year: typeof value.year === "number" ? value.year : undefined,
			doi,
			publishedAt: text(value.publicationDate) || undefined,
			sourceReceipt: receipt({
				sourceRef: `semantic-scholar:${paperId}`,
				locator,
				kind: "literature",
				title,
				payload: item,
			}),
		},
	];
}

function createSemanticScholarConnector(fetchImpl: typeof fetch): ResearchConnector {
	const connector: ResearchConnector = {
		descriptor: { id: "semantic-scholar", kind: "literature", label: "Semantic Scholar", enabled: true },
		async search(query, options) {
			const limit = clampLimit(options.limit);
			const config = record(record(options.config).semanticScholar);
			const apiBase = (text(config.apiBase) || "https://api.semanticscholar.org").replace(/\/$/u, "");
			const headers: Record<string, string> = {};
			const apiKey = text(config.apiKey);
			if (apiKey) headers["x-api-key"] = apiKey;
			const fields = "title,abstract,authors,year,externalIds,url,venue,publicationDate";
			const value = record(
				await fetchJson(
					fetchImpl,
					`${apiBase}/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`,
					options,
					headers,
				),
			);
			return (Array.isArray(value.data) ? value.data : []).slice(0, limit).flatMap(semanticScholarHit);
		},
		recommend: async (seed, options) => {
			const limit = clampLimit(options.limit);
			const config = record(record(options.config).semanticScholar);
			const apiBase = (text(config.apiBase) || "https://api.semanticscholar.org").replace(/\/$/u, "");
			const headers: Record<string, string> = {};
			const apiKey = text(config.apiKey);
			if (apiKey) headers["x-api-key"] = apiKey;
			const fields = "title,abstract,authors,year,externalIds,url,venue,publicationDate";
			const value = record(
				await fetchJson(
					fetchImpl,
					`${apiBase}/recommendations/v1/papers/for/${encodeURIComponent(seed)}?limit=${limit}&fields=${fields}`,
					options,
					headers,
				),
			);
			return (Array.isArray(value.recommendedPapers) ? value.recommendedPapers : [])
				.slice(0, limit)
				.flatMap(semanticScholarHit);
		},
	};
	return connector;
}

function xmlTag(value: string, tag: string): string {
	const match = value.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "iu"));
	return text(match?.[1])
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"');
}

function createArxivConnector(fetchImpl: typeof fetch): ResearchConnector {
	return {
		descriptor: { id: "arxiv", kind: "literature", label: "arXiv", enabled: true },
		async search(query, options) {
			const limit = clampLimit(options.limit);
			const xml = await fetchText(
				fetchImpl,
				`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`,
				options,
			);
			return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/giu)].slice(0, limit).flatMap((match) => {
				const entry = match[1] ?? "";
				const rawId = xmlTag(entry, "id");
				const arxivId = rawId.match(/arxiv\.org\/(?:abs|pdf)\/([^?#]+?)(?:\.pdf)?$/iu)?.[1];
				const title = xmlTag(entry, "title");
				if (!arxivId || !title) return [];
				const locator = `https://arxiv.org/abs/${arxivId}`;
				const authors = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/giu)].map(
					(item) => text(item[1]).replaceAll("&amp;", "&"),
				);
				const publishedAt = xmlTag(entry, "published") || undefined;
				return [
					{
						id: `arxiv:${arxivId}`,
						title,
						summary: xmlTag(entry, "summary") || "arXiv record",
						locator,
						sourceType: "literature",
						authors,
						publishedAt,
						arxivId,
						sourceReceipt: receipt({
							sourceRef: `arxiv:${arxivId}`,
							locator,
							kind: "literature",
							title,
							payload: entry,
						}),
					},
				] satisfies readonly ResearchConnectorHit[];
			});
		},
	};
}

function createProjectStorageConnector(projectStorage: ResearchProjectStoragePort): ResearchConnector {
	return {
		descriptor: { id: "project-storage", kind: "project-storage", label: "Project files", enabled: true },
		async search(query, options) {
			if (!options.cwd) throw new Error("Project storage connector requires a project root");
			const limit = clampLimit(options.limit);
			const items = await projectStorage.search({ cwd: options.cwd, query, limit, signal: options.signal });
			return items.slice(0, limit).flatMap((item) => {
				const relativePath = text(item.relativePath).replaceAll("\\", "/");
				if (!relativePath || relativePath.endsWith("/")) return [];
				const sourceRef = `project-storage:${hash({ cwd: options.cwd, relativePath })}`;
				const title = text(item.title) || relativePath;
				return [
					{
						id: sourceRef,
						title,
						summary:
							text(item.summary) ||
							[item.format, item.size == null ? "" : `${item.size} bytes`].filter(Boolean).join(" · "),
						locator: relativePath,
						sourceType: "project-storage",
						sourceReceipt: {
							sourceRef,
							locator: relativePath,
							sourceType: "project-storage",
							title,
							version: item.modifiedAt,
							accessedAt: isoNow(),
							contentHash:
								item.contentHash || hash({ cwd: options.cwd, relativePath, size: item.size, modifiedAt: item.modifiedAt }),
							readOnly: true,
						},
					},
				];
			});
		},
	};
}

export function createResearchConnectorHostLoader(options: ResearchConnectorHostOptions): ResearchConnectorHostLoader {
	const connectors = [
		...(options.fetchImpl
			? [createSemanticScholarConnector(options.fetchImpl), createArxivConnector(options.fetchImpl)]
			: []),
		...(options.projectStorage ? [createProjectStorageConnector(options.projectStorage)] : []),
	];
	if (!connectors.length) {
		return {
			contractVersion: 1,
			load: () => ({
				contractVersion: 1,
				status: "unavailable",
				list: () => [],
				recommend: async () => {
					throw new Error("Research connector transport is unavailable; the host must inject an authorized connector registry");
				},
				search: async () => {
					throw new Error("Research connector transport is unavailable; the host must inject an authorized connector registry");
				},
			}),
		};
	}
	const byId = new Map(connectors.map((connector) => [connector.descriptor.id, connector]));
	const list = () => connectors.map((connector) => connector.descriptor);
	return {
		contractVersion: 1,
		load(): ResearchConnectorHostAdapter {
			return {
				contractVersion: 1,
				status: "ready",
				list,
				async recommend(seed, connectorId, context = {}, limit = 10) {
					const connector = byId.get(connectorId);
					if (!connector) {
						return {
							hits: [],
							failures: [{ connectorId, message: `Unknown research connector: ${connectorId}`, retryable: false, at: isoNow() }],
						};
					}
					if (!connector.recommend) return { hits: [], failures: [] };
					try {
						return { hits: await connector.recommend(seed, { ...context, limit }), failures: [] };
					} catch (error) {
						return { hits: [], failures: [failure(connectorId, error)] };
					}
				},
				async search(input, context = {}) {
					const query = input.query.normalize("NFKC").trim();
					if (!query || query.length > 512) throw new Error("Research search query is required");
					const requested = input.connectorIds ? [...input.connectorIds] : connectors.map((connector) => connector.descriptor.id);
					const selected = requested.map((id) => byId.get(id)).filter((connector): connector is ResearchConnector => Boolean(connector));
					const limit = clampLimit(input.limit);
					const failures: ResearchConnectorFailure[] = requested
						.filter((id) => !byId.has(id))
						.map((connectorId) => ({ connectorId, message: `Unknown research connector: ${connectorId}`, retryable: false, at: isoNow() }));
					const settled = await Promise.allSettled(
						selected.map((connector) =>
							connector.search(query, {
								...context,
								cwd: input.cwd ?? context.cwd,
								signal: input.signal ?? context.signal,
								limit,
							}),
						),
					);
					const hits: ResearchConnectorHit[] = [];
					settled.forEach((result, index) => {
						const connector = selected[index];
						if (!connector) return;
						if (result.status === "fulfilled") hits.push(...result.value);
						else failures.push(failure(connector.descriptor.id, result.reason));
					});
					const deduped = [...new Map(hits.map((hit) => [hit.id, hit])).values()].slice(0, limit * Math.max(1, selected.length));
					return { query, hits: deduped, failures, connectors: requested, complete: failures.length === 0 };
				},
			};
		},
	};
}
