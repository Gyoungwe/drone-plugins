import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { createKnowledgeIndexRuntime } from "../src/core/index-runtime.js";
import { createLocalKnowledgeIndexFiles } from "../src/core/index-runtime-local.js";
import type { KnowledgeIndexTransport } from "../src/core/index-runtime-ports.js";
import { encodeVector, vectorNorm } from "../src/core/vector-codec.js";

const fingerprint = "recall-test";
const query = { vector: [1, 0], fingerprint, project: "current-project" };

interface ChunkSeed {
	path: string;
	vector: number[];
	count?: number;
	firstChunkIndex?: number;
	malformed?: boolean;
}

interface CandidateResult {
	items: Array<{ path: string; chunkIndex: number }>;
	partial: boolean;
	scanned: number;
	totalEligible: number;
	nextCursor: null;
}

async function openRuntime(database: string, vault: string) {
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
	return {
		close: () => runtime.close(),
		async request<Result>(op: string, args: Record<string, unknown>): Promise<Result> {
			if (!transport.receive) throw new Error("The runtime never registered a message handler");
			await transport.receive({ id: 1, op, args });
			const reply = transport.reply as { id: number; result: Result; error?: string } | undefined;
			delete transport.reply;
			if (reply?.id !== 1) throw new Error("The runtime did not reply to the request");
			if (reply.error !== undefined) throw new Error(reply.error);
			return reply.result;
		},
	};
}

function seedChunks(database: string, chunks: ChunkSeed[]) {
	const db = new DatabaseSync(database);
	try {
		const findNote = db.prepare("SELECT hash FROM notes WHERE path=?");
		const insert = db.prepare(
			"INSERT INTO semantic_chunks(path,chunk_index,hash,fingerprint,mtime,vector,dimension,norm) VALUES(?,?,?,?,?,?,?,?)",
		);
		db.exec("BEGIN");
		for (const { path, vector, count = 1, firstChunkIndex = 0, malformed } of chunks) {
			const note = findNote.get(path);
			if (typeof note?.hash !== "string") throw new Error(`Fixture note was not indexed: ${path}`);
			const blob = encodeVector(vector);
			const bytes = malformed ? blob.subarray(0, blob.length - 1) : blob;
			const norm = vectorNorm(vector);
			for (let offset = 0; offset < count; offset++)
				insert.run(path, firstChunkIndex + offset, note.hash, fingerprint, "0", bytes, vector.length, norm);
		}
		db.exec("COMMIT");
	} finally {
		db.close();
	}
}

async function searchSeededIndex(
	chunks: ChunkSeed[],
	options: { limit?: number; minSimilarity?: number } = {},
) {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-recall-")));
	const vault = join(root, "Vault");
	const database = join(root, "index.sqlite");
	try {
		for (const path of new Set(chunks.map((chunk) => chunk.path))) {
			const file = join(vault, path);
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, "# Synthetic note\n");
		}
		const initial = await openRuntime(database, vault);
		try {
			await initial.request("reconcile", { force: true });
		} finally {
			await initial.close();
		}
		seedChunks(database, chunks);
		const reopened = await openRuntime(database, vault);
		try {
			return await reopened.request<CandidateResult>("semanticCandidates", { ...query, ...options });
		} finally {
			await reopened.close();
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

it("ranks a later path first after scanning more than 5000 chunks", async () => {
	const early = "Library/aaa.md";
	const late = "Library/zzz.md";
	const result = await searchSeededIndex([
		{ path: early, vector: [3, 4], count: 5001 },
		{ path: early, vector: [4, 3], firstChunkIndex: 5001 },
		{ path: late, vector: [1, 0] },
	]);

	expect(result.items.map(({ path, chunkIndex }) => ({ path, chunkIndex }))).toEqual([
		{ path: late, chunkIndex: 0 },
		{ path: early, chunkIndex: 5001 },
	]);
	expect(result).toMatchObject({ partial: false, scanned: 5003, totalEligible: 5003, nextCursor: null });
}, 120000);

it("returns exactly 24 qualifying paths in path order when scores tie", async () => {
	const paths = Array.from({ length: 25 }, (_, index) => `Library/note-${String(index).padStart(2, "0")}.md`);
	const result = await searchSeededIndex(
		[...paths].reverse().map((path) => ({ path, vector: [1, 0] })),
		{ limit: 24 },
	);

	expect(result.items).toHaveLength(24);
	expect(result.items.map(({ path }) => path)).toEqual(paths.slice(0, 24));
}, 120000);

it("skips ineligible notes, wrong dimensions, corrupt blobs, and below-threshold scores", async () => {
	const shared = "Library/shared.md";
	const project = "Projects/current-project/eligible.md";
	const result = await searchSeededIndex(
		[
			{ path: shared, vector: [1, 0] },
			{ path: project, vector: [1, 0] },
			{ path: "Library/wrong-dimension.md", vector: [1, 0, 0] },
			{ path: "Library/corrupt.md", vector: [1, 0], malformed: true },
			{ path: "Library/Explainers/explainer.md", vector: [1, 0] },
			{ path: "Projects/other-project/ineligible.md", vector: [1, 0] },
			{ path: "Library/low-similarity.md", vector: [3, 4] },
		],
		{ minSimilarity: 0.75 },
	);

	expect(result.items.map(({ path }) => path)).toEqual([shared, project]);
	expect(result).toMatchObject({ partial: false, scanned: 5, totalEligible: 5 });
}, 120000);
