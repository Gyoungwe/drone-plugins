import type { DatabaseSync } from "node:sqlite";
import { cosineSimilarity, decodeVector, storedVectorNorm } from "./vector-codec.js";

const BATCH_SIZE = 1000;
const CHUNK_KEY = "chunks.path, chunks.chunk_index, chunks.hash, chunks.fingerprint";
const SELECT_ELIGIBLE = `SELECT ${CHUNK_KEY}, chunks.vector, chunks.dimension, chunks.norm,
		chunks.start_char, chunks.end_char, notes.title, notes.kind
	FROM semantic_chunks AS chunks INDEXED BY sqlite_autoindex_semantic_chunks_1
	CROSS JOIN notes ON notes.path = chunks.path AND notes.hash = chunks.hash
	WHERE chunks.fingerprint = ? AND (notes.scope = 'shared' OR notes.scope = ?) AND notes.kind != 'explainer'`;
const ORDER_BATCH = `ORDER BY ${CHUNK_KEY} LIMIT ?`;

interface CandidateArgs {
	vector?: unknown;
	fingerprint?: unknown;
	project?: string;
	limit?: number;
	minSimilarity?: unknown;
}

export interface SemanticCandidateObserver {
	batchSize?: number;
	onBatch?: (batch: { fetched: number; decoded: number }) => void;
}

type ChunkKey = [path: string, chunkIndex: number, hash: string, fingerprint: string];
type DecodeCounter = { decoded: number };

type ChunkRow = {
	path: string;
	chunk_index: number;
	hash: string;
	fingerprint: string;
	vector: Uint8Array | string;
	dimension: number;
	norm: number | null;
	start_char: number | null;
	end_char: number | null;
	title: string;
	kind: string;
};

function scoreChunk(row: ChunkRow, query: readonly number[], counter: DecodeCounter): number {
	if (row.dimension !== query.length) return Number.NaN;
	const stored = { bytes: row.vector, dimension: row.dimension };
	let vector: number[];
	try {
		counter.decoded += 1;
		vector = decodeVector(stored);
	} catch {
		return Number.NaN;
	}
	if (vector.length !== query.length) return Number.NaN;
	return cosineSimilarity(query, vector, storedVectorNorm(vector, stored, row.norm));
}

function toCandidate(row: ChunkRow, score: number) {
	return {
		path: row.path,
		title: row.title,
		hash: row.hash,
		kind: row.kind,
		score,
		chunkIndex: row.chunk_index,
		startChar: row.start_char,
		endChar: row.end_char,
	};
}

export function semanticCandidates(
	db: DatabaseSync,
	args: CandidateArgs,
	observer: SemanticCandidateObserver = {},
) {
	const batchSize = observer.batchSize ?? BATCH_SIZE;
	if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Invalid semantic batch size");
	if (
		!Array.isArray(args.vector) ||
		!args.vector.length ||
		args.vector.some(
			(component) =>
				typeof component !== "number" || !Number.isFinite(component) || Math.abs(component) > 1_000_000,
		)
	)
		throw new Error("Invalid semantic query vector");
	const fingerprint = String(args.fingerprint || "");
	if (!fingerprint || fingerprint.length > 300) throw new Error("Invalid semantic fingerprint");
	const minSimilarity = args.minSimilarity === undefined ? 0.45 : args.minSimilarity;
	if (
		typeof minSimilarity !== "number" ||
		!Number.isFinite(minSimilarity) ||
		minSimilarity < 0 ||
		minSimilarity > 1
	)
		throw new Error("Invalid semantic similarity threshold");
	const query: number[] = args.vector;
	const limit = Math.max(1, Math.min(24, Math.floor(args.limit || 5)));
	const scope = args.project || "";
	const first = db.prepare(`${SELECT_ELIGIBLE} ${ORDER_BATCH}`);
	const next = db.prepare(`${SELECT_ELIGIBLE} AND (${CHUNK_KEY}) > (?, ?, ?, ?) ${ORDER_BATCH}`);
	const best = new Map<string, ReturnType<typeof toCandidate>>();
	let scanned = 0;
	let cursor: ChunkKey | undefined;
	for (;;) {
		const counter = { decoded: 0 };
		let rows: ChunkRow[];
		if (cursor) rows = next.all(fingerprint, scope, ...cursor, batchSize) as ChunkRow[];
		else rows = first.all(fingerprint, scope, batchSize) as ChunkRow[];
		scanned += rows.length;
		for (const row of rows) {
			const score = scoreChunk(row, query, counter);
			if (!Number.isFinite(score) || score < minSimilarity) continue;
			const current = best.get(row.path);
			if (!current || score > current.score) best.set(row.path, toCandidate(row, score));
		}
		observer.onBatch?.({ fetched: rows.length, decoded: counter.decoded });
		if (rows.length < batchSize) break;
		const last = rows[rows.length - 1];
		cursor = [last.path, last.chunk_index, last.hash, last.fingerprint];
	}
	const items = [...best.values()]
		.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
		.slice(0, limit);
	return { items, partial: false, scanned, totalEligible: scanned, nextCursor: null };
}
