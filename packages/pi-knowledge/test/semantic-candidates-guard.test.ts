import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { createKnowledgeIndexRuntime } from "../src/core/index-runtime.js";
import { createLocalKnowledgeIndexFiles } from "../src/core/index-runtime-local.js";
import type { KnowledgeIndexTransport } from "../src/core/index-runtime-ports.js";
import { semanticCandidates } from "../src/core/semantic-candidates.js";
import { encodeVector, vectorNorm } from "../src/core/vector-codec.js";

/** Counts stay stable across machines; elapsed time can vary with CI load. */
const fingerprint = "semantic-guard-test";
const query = { vector: [1, 0], fingerprint, project: "current-project" };

interface ChunkSeed {
	path: string;
	vector: number[];
	count?: number;
}

interface BatchCount {
	fetched: number;
	decoded: number;
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
		async request(op: string, args: Record<string, unknown>) {
			if (!transport.receive) throw new Error("The runtime never registered a message handler");
			await transport.receive({ id: 1, op, args });
			const reply = transport.reply as { id: number; error?: string } | undefined;
			delete transport.reply;
			if (reply?.id !== 1) throw new Error("The runtime did not reply to the request");
			if (reply.error !== undefined) throw new Error(reply.error);
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
		for (const { path, vector, count = 1 } of chunks) {
			const note = findNote.get(path);
			if (typeof note?.hash !== "string") throw new Error(`Fixture note was not indexed: ${path}`);
			const blob = encodeVector(vector);
			const norm = vectorNorm(vector);
			for (let index = 0; index < count; index++)
				insert.run(path, index, note.hash, fingerprint, "0", blob, vector.length, norm);
		}
		db.exec("COMMIT");
	} finally {
		db.close();
	}
}

async function inspectSeededIndex(chunks: ChunkSeed[], batchSize?: number) {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-semantic-guard-")));
	const vault = join(root, "Vault");
	const database = join(root, "index.sqlite");
	const batches: BatchCount[] = [];
	try {
		for (const path of new Set(chunks.map((chunk) => chunk.path))) {
			const file = join(vault, path);
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, "# Synthetic note\n");
		}
		const runtime = await openRuntime(database, vault);
		try {
			await runtime.request("reconcile", { force: true });
		} finally {
			await runtime.close();
		}
		seedChunks(database, chunks);
		const db = new DatabaseSync(database);
		try {
			const result = semanticCandidates(db, query, {
				...(batchSize === undefined ? {} : { batchSize }),
				onBatch: (batch) => batches.push(batch),
			});
			return { result, batches };
		} finally {
			db.close();
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

const sum = (batches: BatchCount[], key: keyof BatchCount) =>
	batches.reduce((total, batch) => total + batch[key], 0);

it("decodes every eligible row exactly once and excludes ineligible notes in SQL", async () => {
	const eligible = 11;
	const { result, batches } = await inspectSeededIndex([
		{ path: "Library/eligible.md", vector: [1, 0], count: eligible },
		{ path: "Projects/other-project/ineligible.md", vector: [1, 0] },
		{ path: "Library/Explainers/explainer.md", vector: [1, 0] },
	]);

	expect(sum(batches, "decoded")).toBe(eligible);
	expect(sum(batches, "fetched")).toBe(eligible);
	expect(result.scanned).toBe(eligible);
}, 120000);

it("keeps fetched rows per batch bounded as the index grows", async () => {
	for (const count of [50, 500]) {
		const { batches } = await inspectSeededIndex([{ path: "Library/eligible.md", vector: [1, 0], count }], 7);
		expect(Math.max(...batches.map(({ fetched }) => fetched))).toBeLessThanOrEqual(7);
		expect(batches).toHaveLength(Math.floor(count / 7) + 1);
	}
}, 120000);

it("does not decode rows whose dimensions do not match the query", async () => {
	const eligible = 5;
	const wrongDimension = 3;
	const { batches } = await inspectSeededIndex([
		{ path: "Library/right-dimension.md", vector: [1, 0], count: eligible },
		{ path: "Library/wrong-dimension.md", vector: [1, 0, 0], count: wrongDimension },
	]);

	expect(sum(batches, "decoded")).toBe(eligible);
	expect(sum(batches, "fetched")).toBe(eligible + wrongDimension);
}, 120000);

it("rejects invalid observer batch sizes", async () => {
	await expect(inspectSeededIndex([{ path: "Library/eligible.md", vector: [1, 0] }], 0)).rejects.toThrow(
		"Invalid semantic batch size",
	);
}, 120000);
