import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createKnowledgeIndexRuntime } from "../src/core/index-runtime.js";
import { createLocalKnowledgeIndexFiles } from "../src/core/index-runtime-local.js";
import type { KnowledgeIndexTransport } from "../src/core/index-runtime-ports.js";

/**
 * KP4b — a note that cannot be read is a fault, not an absence.
 *
 * KP4 split the write into a prepare phase and an apply phase.  The apply
 * phase recorded a note's failure and returned `null`, which was the same as
 * saying the note was simply gone.  So a note that could not be read — a
 * symlink pointing outside the Vault — was reported as missing, and the
 * caller read it as if it had never been indexed.
 *
 * The rule this test pins:
 *
 * - a note that is **gone** leaves the index quietly;
 * - a note that **cannot be read** raises the fault again.
 *
 * And the second rule, which the first one could have broken: a note that
 * raises must not cost the batch its other notes.  The batch groups the
 * writes, so one bad note used to roll the whole group back.
 */

interface RuntimeStatus {
	noteCount: number;
	stats: { transactions: number; bodyReads: number; metadataChecks: number };
}

interface Runtime {
	request: <T = unknown>(op: string, args?: Record<string, unknown>) => Promise<T>;
	close: () => Promise<void>;
}

const body = (index: number) =>
	`# Synthetic note ${index}\n\nmarker${index} topic${index % 16} synthetic material\n\n`.repeat(20);

async function openRuntime(root: string, noteCount: number): Promise<Runtime> {
	const vault = join(root, "Vault");
	for (let index = 0; index < noteCount; index++) {
		const absolute = join(vault, `Library/Papers/note-${String(index).padStart(5, "0")}.md`);
		await mkdir(dirname(absolute), { recursive: true });
		await writeFile(absolute, body(index));
	}
	let receive:
		| ((message: { id: number; op: string; args?: Record<string, unknown> }) => Promise<void>)
		| null = null;
	let next = 0;
	const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
	const runtime = await createKnowledgeIndexRuntime(
		{ database: join(root, "index.sqlite"), backgroundReconcile: false },
		{ ...createLocalKnowledgeIndexFiles(vault), watch: null },
		{
			onMessage: (handler) => {
				receive = handler;
			},
			close: () => undefined,
			send(message: object) {
				const payload = message as {
					id?: number;
					ready?: boolean;
					uiChanged?: boolean;
					error?: string;
					result?: unknown;
				};
				if (payload.ready || payload.uiChanged) return;
				if (payload.id === undefined) return;
				const request = pending.get(payload.id);
				if (!request) return;
				pending.delete(payload.id);
				if (payload.error) request.reject(new Error(payload.error));
				else request.resolve(payload.result);
			},
		} satisfies KnowledgeIndexTransport,
	);
	const request = async <T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<T> => {
		const id = ++next;
		const response = new Promise<T>((resolve, reject) =>
			pending.set(id, { resolve: resolve as (value: unknown) => void, reject }),
		);
		if (!receive) throw new Error("The runtime never registered a message handler");
		await receive({ id, op, args });
		return response;
	};
	await request("reconcile", { force: true });
	return { request, close: () => runtime.close() };
}

describe("a note that cannot be read", () => {
	it("raises the fault instead of reporting the note as missing", async () => {
		const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-fault-")));
		try {
			const vault = join(root, "Vault");
			// A note outside the Vault, linked into it.  The link is the only
			// path to it, so the index can only see it through the link.
			await writeFile(join(root, "outside.md"), "# Outside\n\nsecret\n");
			await mkdir(join(vault, "Library"), { recursive: true });
			await symlink(join(root, "outside.md"), join(vault, "Library", "link.md"));

			const runtime = await openRuntime(root, 3);
			// The read must fail, and it must fail with the reason: a symlink
			// is a fault, not an absence.  A read that resolved would mean the
			// index served a file it should never have followed.
			await expect(runtime.request("read", { path: "Library/link.md" })).rejects.toThrow(/symlink|follow/i);
			await runtime.close();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}, 120000);

	it("does not cost the batch the notes that can be read", async () => {
		const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-fault-")));
		try {
			const vault = join(root, "Vault");
			// The note is indexed first, and *then* replaced by a link.  This
			// is the case the batch has to survive: the note is in the
			// database, the walk finds it again, and reading it now fails.
			const runtime = await openRuntime(root, 20);
			const target = join(vault, "Library", "Papers", "note-00000.md");
			await rm(target);
			await writeFile(join(root, "outside.md"), "# Outside\n\nsecret\n");
			await symlink(join(root, "outside.md"), target);

			await runtime.request("reconcile", { force: true });
			const status = await runtime.request<RuntimeStatus>("status", {});
			// The other notes are indexed.  A single unreadable note must not
			// roll back the group it was batched with.
			expect(status.noteCount).toBe(19);
			await runtime.close();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}, 120000);

	it("leaves a note that is simply gone out of the index without complaint", async () => {
		const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-fault-")));
		try {
			const runtime = await openRuntime(root, 3);
			// A note that was never there is an absence, and an absence is
			// reported as missing rather than raised.
			const page = await runtime.request<{ path: string; missing?: boolean }>("read", {
				path: "Library/never-existed.md",
			});
			expect(page.missing).toBe(true);
			await runtime.close();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}, 120000);
});
