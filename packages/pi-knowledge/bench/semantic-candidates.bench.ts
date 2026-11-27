import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { createKnowledgeIndexRuntime } from "../src/core/index-runtime.js";
import { createLocalKnowledgeIndexFiles } from "../src/core/index-runtime-local.js";
import type { KnowledgeIndexTransport } from "../src/core/index-runtime-ports.js";
import { semanticCandidates } from "../src/core/semantic-candidates.js";
import { encodeVector, vectorNorm } from "../src/core/vector-codec.js";

const FINGERPRINT = "semantic-bench-v1";
const CLUSTER_COUNT = 32;

interface BenchParameters {
	size: number;
	dims: number;
	queries: number;
	repeat: number;
	chunksPerNote: number;
	seed: number;
}

interface Dataset {
	vectors: Float64Array;
	norms: Float64Array;
	paths: string[];
	datasetSha256: string;
	notes: number;
}

interface CandidateResponse {
	items: Array<{ path: string }>;
	scanned: number;
}

function environmentInteger(name: string): number {
	const value = process.env[name];
	const parsed = Number(value);
	if (!value || !Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`Invalid ${name}`);
	return parsed;
}

function readParameters(): BenchParameters {
	return {
		size: environmentInteger("PI_KNOWLEDGE_BENCH_SIZE"),
		dims: environmentInteger("PI_KNOWLEDGE_BENCH_DIMS"),
		queries: environmentInteger("PI_KNOWLEDGE_BENCH_QUERIES"),
		repeat: environmentInteger("PI_KNOWLEDGE_BENCH_REPEAT"),
		chunksPerNote: environmentInteger("PI_KNOWLEDGE_BENCH_CHUNKS_PER_NOTE"),
		seed: environmentInteger("PI_KNOWLEDGE_BENCH_SEED"),
	};
}

function randomGenerator(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function gaussian(random: () => number): number {
	const first = Math.max(random(), Number.MIN_VALUE);
	return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * random());
}

function normalize(vector: number[]): number[] {
	const norm = vectorNorm(vector);
	for (let index = 0; index < vector.length; index++) vector[index] /= norm;
	return vector;
}

function createCenters(dims: number, random: () => number): Float64Array[] {
	return Array.from({ length: CLUSTER_COUNT }, () =>
		Float64Array.from(normalize(Array.from({ length: dims }, () => gaussian(random)))),
	);
}

function notePath(index: number): string {
	return `Library/bench-${String(index).padStart(5, "0")}.md`;
}

function insertNoteRows(db: DatabaseSync, paths: string[], hashes: string[]): void {
	const insert = db.prepare(
		"INSERT INTO notes(path,title,body,hash,signature,scope,kind,bytes,filename) VALUES(?,?,?,?,?,?,?,?,?)",
	);
	for (let index = 0; index < paths.length; index++) {
		const path = paths[index];
		insert.run(path, `Benchmark note ${index}`, "", hashes[index], hashes[index], "shared", "note", 0, path);
	}
}

function insertChunkRows(
	db: DatabaseSync,
	parameters: BenchParameters,
	paths: string[],
	hashes: string[],
	vectors: Float64Array,
	norms: Float64Array,
	centers: Float64Array[],
	random: () => number,
	digest: ReturnType<typeof createHash>,
): void {
	const insert = db.prepare(
		"INSERT INTO semantic_chunks(path,chunk_index,hash,fingerprint,mtime,vector,dimension,start_char,end_char,norm) VALUES(?,?,?,?,?,?,?,?,?,?)",
	);
	for (let index = 0; index < parameters.size; index++) {
		const center = centers[Math.floor(random() * CLUSTER_COUNT)];
		const vector = normalize(Array.from(center, (value) => value + gaussian(random) * 0.12));
		const norm = vectorNorm(vector);
		const offset = index * parameters.dims;
		vectors.set(vector, offset);
		norms[index] = norm;
		const bytes = encodeVector(vector);
		digest.update(bytes);
		const noteIndex = Math.floor(index / parameters.chunksPerNote);
		insert.run(
			paths[noteIndex],
			index % parameters.chunksPerNote,
			hashes[noteIndex],
			FINGERPRINT,
			"0",
			bytes,
			parameters.dims,
			null,
			null,
			norm,
		);
	}
}

function seedDataset(db: DatabaseSync, parameters: BenchParameters): Dataset {
	const { size, dims, chunksPerNote } = parameters;
	const notes = Math.ceil(size / chunksPerNote);
	const paths = Array.from({ length: notes }, (_, index) => notePath(index));
	const hashes = paths.map((path) => createHash("sha256").update(path).digest("hex"));
	const vectors = new Float64Array(size * dims);
	const norms = new Float64Array(size);
	const random = randomGenerator(parameters.seed);
	const centers = createCenters(dims, random);
	const digest = createHash("sha256");
	db.exec("BEGIN IMMEDIATE");
	try {
		insertNoteRows(db, paths, hashes);
		insertChunkRows(db, parameters, paths, hashes, vectors, norms, centers, random, digest);
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
	return { vectors, norms, paths, datasetSha256: digest.digest("hex"), notes };
}

async function initializeSchema(database: string, vault: string): Promise<void> {
	const transport: {
		receive?: Parameters<KnowledgeIndexTransport["onMessage"]>[0];
		reply?: object;
	} = {};
	const runtime = await createKnowledgeIndexRuntime(
		{ database, backgroundReconcile: false },
		{ ...createLocalKnowledgeIndexFiles(vault), watch: null },
		{
			onMessage(handler) {
				transport.receive = handler;
			},
			close: () => undefined,
			send(message) {
				if ("id" in message) transport.reply = message;
			},
		},
	);
	try {
		if (!transport.receive) throw new Error("The runtime did not register a message handler");
		await transport.receive({ id: 1, op: "reconcile", args: { force: true } });
		const reply = transport.reply as { id: number; error?: string } | undefined;
		if (reply?.id !== 1) throw new Error("The runtime did not finish schema reconciliation");
		if (reply.error) throw new Error(reply.error);
	} finally {
		await runtime.close();
	}
}

async function buildIndex(root: string, parameters: BenchParameters) {
	const started = performance.now();
	const vault = join(root, "Vault");
	const database = join(root, "index.sqlite");
	await mkdir(vault, { recursive: true });
	await initializeSchema(database, vault);
	const db = new DatabaseSync(database);
	try {
		const dataset = seedDataset(db, parameters);
		db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		return {
			...dataset,
			database,
			dbBytes: (await stat(database)).size,
			buildMs: performance.now() - started,
		};
	} finally {
		db.close();
	}
}

function createQueries(dataset: Dataset, parameters: BenchParameters): number[][] {
	const random = randomGenerator(parameters.seed ^ 0x9e3779b9);
	return Array.from({ length: parameters.queries }, () => {
		const row = Math.floor(random() * parameters.size);
		const offset = row * parameters.dims;
		return normalize(
			Array.from(
				{ length: parameters.dims },
				(_, index) => dataset.vectors[offset + index] + gaussian(random) * 0.02,
			),
		);
	});
}

function trueTopPaths(dataset: Dataset, parameters: BenchParameters, query: number[]): string[] {
	const best = new Map<string, number>();
	const queryNorm = vectorNorm(query);
	for (let row = 0; row < parameters.size; row++) {
		let dot = 0;
		const offset = row * parameters.dims;
		for (let index = 0; index < parameters.dims; index++)
			dot += query[index] * dataset.vectors[offset + index];
		const score = dot / (queryNorm * dataset.norms[row]);
		if (score < 0) continue;
		const path = dataset.paths[Math.floor(row / parameters.chunksPerNote)];
		const current = best.get(path);
		if (current === undefined || score > current) best.set(path, score);
	}
	return [...best.entries()]
		.sort(
			([leftPath, leftScore], [rightPath, rightScore]) =>
				rightScore - leftScore || leftPath.localeCompare(rightPath),
		)
		.slice(0, 12)
		.map(([path]) => path);
}

function recallAt(actual: string[], expected: string[], limit: number): number {
	const expectedPaths = new Set(expected.slice(0, limit));
	return actual.slice(0, limit).filter((path) => expectedPaths.has(path)).length / limit;
}

function nearestRank(values: number[], percentile: number): number {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.ceil(percentile * sorted.length) - 1];
}

function measureQueries(
	db: DatabaseSync,
	parameters: BenchParameters,
	dataset: Dataset,
	queries: number[][],
) {
	const truth = queries.map((query) => trueTopPaths(dataset, parameters, query));
	const search = (vector: number[]): CandidateResponse =>
		semanticCandidates(db, {
			vector,
			fingerprint: FINGERPRINT,
			project: "current-project",
			limit: 12,
			minSimilarity: 0,
		});
	for (let index = 0; index < 2; index++) search(queries[index % queries.length]);
	const times: number[] = [];
	let recall5 = 0;
	let recall12 = 0;
	for (let index = 0; index < queries.length; index++) {
		let paths: string[] = [];
		for (let repetition = 0; repetition < parameters.repeat; repetition++) {
			const started = performance.now();
			const response = search(queries[index]);
			times.push(performance.now() - started);
			if (response.scanned !== parameters.size)
				throw new Error(`Expected to scan ${parameters.size}, got ${response.scanned}`);
			paths = response.items.map((item) => item.path);
		}
		recall5 += recallAt(paths, truth[index], 5);
		recall12 += recallAt(paths, truth[index], 12);
	}
	return {
		recall5: recall5 / queries.length,
		recall12: recall12 / queries.length,
		p50Ms: nearestRank(times, 0.5),
		p95Ms: nearestRank(times, 0.95),
		meanMs: times.reduce((sum, value) => sum + value, 0) / times.length,
		scanned: parameters.size,
	};
}

it(
	"measures semantic candidate recall and latency for one seeded dataset",
	async () => {
		const parameters = readParameters();
		const resultPath = process.env.PI_KNOWLEDGE_BENCH_RESULT;
		if (!resultPath) throw new Error("Missing PI_KNOWLEDGE_BENCH_RESULT");
		const root = await mkdtemp(join(tmpdir(), "pi-knowledge-semantic-cell-"));
		try {
			const built = await buildIndex(root, parameters);
			const queries = createQueries(built, parameters);
			const db = new DatabaseSync(built.database);
			let measurement: ReturnType<typeof measureQueries>;
			try {
				measurement = measureQueries(db, parameters, built, queries);
			} finally {
				db.close();
			}
			const result = {
				size: parameters.size,
				dims: parameters.dims,
				chunksPerNote: parameters.chunksPerNote,
				notes: built.notes,
				queries: parameters.queries,
				repeat: parameters.repeat,
				seed: parameters.seed,
				datasetSha256: built.datasetSha256,
				...measurement,
				buildMs: built.buildMs,
				dbBytes: built.dbBytes,
				peakRssBytes: process.resourceUsage().maxRSS * 1024,
			};
			expect(result.scanned).toBe(parameters.size);
			await writeFile(resultPath, JSON.stringify(result));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	},
	30 * 60 * 1000,
);
