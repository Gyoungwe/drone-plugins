import { createHash } from "node:crypto";
import {
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import {
	readBinaryStateFile,
	writeBinaryStateFile,
} from "@gyoungwe/plugin-api/node/binary-state";
import { PluginResourceReservations } from "@gyoungwe/plugin-api/node/reservations";
import type {
	PluginRuntimeCapabilities,
	PluginStateReadResult,
} from "@gyoungwe/plugin-api/runtime";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import {
	type InquiryBindingState,
	InquiryLedgerOwner,
	type InquiryWasmEngine,
	inquiryBindingPath,
	parseInquiryBinding,
} from "../src/ledger-owner.js";
import { InquiryService } from "../src/service.js";
import { SqliteInquiryStorage } from "../src/storage.js";
import { createInquiryWasmEngine } from "../src/wasm-storage.js";

const require = createRequire(import.meta.url),
	hash = (bytes: Buffer | string) =>
		createHash("sha256").update(bytes).digest("hex");
const projectId = "original-project",
	workspaceId = "actual-workspace",
	date = "2026-10-28T00:00:00.000Z";
const question = (id: string) => ({
	id,
	schemaVersion: 2 as const,
	projectId,
	kind: "hypothesis" as const,
	statement: `Synthetic ${id}`,
	competingExplanations: [],
	testsDone: [],
	testsPlanned: [],
	status: "open" as const,
	proposer: "user" as const,
	priority: 1,
	createdAt: date,
	updatedAt: date,
});
let engine: InquiryWasmEngine,
	directory: string,
	binary: string,
	json: string,
	initial: Buffer,
	reservations: PluginResourceReservations,
	owner: InquiryLedgerOwner,
	ports: PluginRuntimeCapabilities;
let controller: AbortController,
	denyLedgerWrite: boolean,
	cancelAfterCommit: boolean,
	binaryWrites: number;
beforeAll(async () => {
	engine = await createInquiryWasmEngine(
		await readFile(require.resolve("sql.js/dist/sql-wasm.wasm")),
	);
});
async function readJson(path: string): Promise<PluginStateReadResult> {
	try {
		const text = await readFile(join(json, path), "utf8");
		return { kind: "value", value: JSON.parse(text), version: hash(text) };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return { kind: "missing", version: null };
	}
}
async function state(): Promise<InquiryBindingState> {
	const path = inquiryBindingPath(workspaceId),
		result = await readJson(path);
	const value = parseInquiryBinding(result, workspaceId);
	if (result.kind !== "value" || !value)
		throw new Error("Fixture binding missing");
	return { root: "json", path, value, version: result.version };
}
function reopened() {
	return state().then(
		(binding) =>
			new InquiryLedgerOwner(engine, ports, binding, {
				handle: "binary",
				kind: "binary-state",
				path: binary,
				access: "read-write",
			}),
	);
}
beforeEach(async () => {
	directory = await realpath(await mkdtemp(join(tmpdir(), "inquiry-owner-")));
	binary = join(directory, "ledger");
	json = join(directory, "metadata");
	await mkdir(binary);
	await mkdir(json);
	reservations = new PluginResourceReservations(join(directory, "leases"));
	controller = new AbortController();
	denyLedgerWrite = false;
	cancelAfterCommit = false;
	binaryWrites = 0;
	const seed = new SqliteInquiryStorage(
		projectId,
		join(binary, "ledger.sqlite"),
	);
	await new InquiryService(seed).recordQuestion(question("original"));
	await seed.close();
	initial = await readFile(join(binary, "ledger.sqlite"));
	const resolvePath = async (path: string) => {
		if (
			isAbsolute(path) ||
			path.includes("\\") ||
			path.split("/").some((part) => part === ".." || part === ".")
		)
			throw new Error("Fixture path confinement");
		let current = binary;
		for (const part of path ? path.split("/") : []) {
			current = join(current, part);
			try {
				if ((await lstat(current)).isSymbolicLink())
					throw new Error("Fixture symlink refusal");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		const suffix = relative(binary, current);
		if (suffix === ".." || suffix.startsWith(`..${sep}`))
			throw new Error("Fixture path confinement");
		return current;
	};
	const access = {
		resolvePath,
		checkRoot: async () => {
			await lstat(binary);
		},
		checkWrite: async () => {
			controller.signal.throwIfAborted();
		},
		assertReserved: (parent: string) =>
			reservations.assertReserved("state-writers", parent),
		conflictError: () => new Error("CAS conflict"),
		cleanupFailed: (error: unknown) => {
			throw error;
		},
	};
	ports = {
		async call(name, input, signal) {
			controller.signal.throwIfAborted();
			const request = input as {
				root: string;
				path: string;
				base64: string;
				expectedVersion: string | null;
				assertAbsent: string[];
				value: unknown;
			};
			if (name === "state.reserve") {
				reservations.reserve("state-writers", [
					request.root === "binary" ? binary : json,
				]);
				return { reserved: true };
			}
			if (name === "state.readBinary")
				return readBinaryStateFile(request.path, access);
			if (name === "state.writeBinary") {
				if (request.path === "ledger.sqlite" && denyLedgerWrite)
					throw new Error("Actual fixture write denied");
				const result = await writeBinaryStateFile(request, {
					signal: signal ?? controller.signal,
					serialize: (operation) => operation(),
					prepare: () => access,
				});
				binaryWrites++;
				if (request.path === "ledger.sqlite" && cancelAfterCommit) {
					controller.abort(new Error("Caller revoked after actual commit"));
					const error = new Error("Actual fixture postcommit unknown");
					Object.assign(error, { code: "EBINARYWRITEOUTCOMEUNKNOWN" });
					throw error;
				}
				return result;
			}
			if (name === "state.readJson") return readJson(request.path);
			if (name === "state.writeJson") {
				const current = await readJson(request.path);
				if (current.version !== request.expectedVersion)
					throw new Error("Metadata CAS conflict");
				const text = JSON.stringify(request.value);
				const temporary = join(json, `${request.path}.tmp`);
				await writeFile(temporary, text, { flag: "wx" });
				controller.signal.throwIfAborted();
				await rename(temporary, join(json, request.path));
				return readJson(request.path);
			}
			throw new Error(`Fixture capability unavailable: ${name}`);
		},
	};
	const value = {
		schemaVersion: 1,
		workspaceId,
		projectId,
		binaryPath: binary,
		originalVersion: hash(initial),
		headVersion: hash(initial),
		backupVersion: null,
		intent: null,
	};
	await writeFile(
		join(json, inquiryBindingPath(workspaceId)),
		JSON.stringify(value),
	);
	owner = await reopened();
});
afterEach(async () => {
	await owner.dispose();
	reservations.dispose();
	await rm(directory, { recursive: true, force: true });
});
it("preserves original SQLite bytes, commits canonical SQL, reopens and explicitly restores the original path", async () => {
	await owner.write(
		"record-question",
		(service) => service.recordQuestion(question("new")),
		controller.signal,
	);
	const backup = join(binary, `ledger.sqlite.pre-plugin-${hash(initial)}.bak`);
	expect(await readFile(backup)).toEqual(initial);
	expect((await owner.snapshot()).questions.map((record) => record.id)).toEqual(
		["new", "original"],
	);
	await owner.dispose();
	owner = await reopened();
	expect((await owner.snapshot()).questions).toHaveLength(2);
	expect(await owner.restoreOriginal(controller.signal)).toMatchObject({
		restored: true,
		version: hash(initial),
	});
	expect(await readFile(join(binary, "ledger.sqlite"))).toEqual(initial);
	expect((await owner.snapshot()).questions.map((record) => record.id)).toEqual(
		["original"],
	);
	expect(engine.inspect(initial)).toMatchObject({
		projectId,
		schemaVersion: 2,
	});
});
it("retains a durable pending intent on denied write and reconciles the unchanged original without retrying it", async () => {
	denyLedgerWrite = true;
	await expect(
		owner.write(
			"record-question",
			(service) => service.recordQuestion(question("denied")),
			controller.signal,
		),
	).rejects.toThrow("write denied");
	expect(await readFile(join(binary, "ledger.sqlite"))).toEqual(initial);
	await expect(owner.snapshot()).rejects.toThrow("explicit SHA reconciliation");
	await owner.dispose();
	owner = await reopened();
	denyLedgerWrite = false;
	const writes = binaryWrites;
	expect(await owner.reconcile(controller.signal)).toMatchObject({
		state: "not-committed",
		version: hash(initial),
	});
	expect(binaryWrites).toBe(writes);
	expect((await owner.snapshot()).questions.map((record) => record.id)).toEqual(
		["original"],
	);
});
it("does no new metadata write after revocation and lets a fresh caller reconcile an actually committed candidate", async () => {
	cancelAfterCommit = true;
	await expect(
		owner.write(
			"record-question",
			(service) => service.recordQuestion(question("accepted")),
			controller.signal,
		),
	).rejects.toMatchObject({ code: "EBINARYWRITEOUTCOMEUNKNOWN" });
	const saved = await state();
	expect(saved.value.intent?.status).toBe("pending");
	expect(saved.value.headVersion).toBe(hash(initial));
	const candidate = await readFile(join(binary, "ledger.sqlite"));
	expect(hash(candidate)).toBe(saved.value.intent?.candidateVersion);
	await owner.dispose();
	controller = new AbortController();
	cancelAfterCommit = false;
	owner = await reopened();
	const writes = binaryWrites;
	expect(await owner.reconcile(controller.signal)).toMatchObject({
		state: "committed",
		version: hash(candidate),
	});
	expect(binaryWrites).toBe(writes);
	expect((await owner.snapshot()).questions.map((record) => record.id)).toEqual(
		["accepted", "original"],
	);
});
it("refuses active WAL sidecars before backup, metadata intent or original mutation", async () => {
	await writeFile(
		join(binary, "ledger.sqlite-wal"),
		"synthetic active sidecar",
	);
	const before = await readJson(inquiryBindingPath(workspaceId));
	await expect(
		owner.write(
			"record-question",
			(service) => service.recordQuestion(question("blocked")),
			controller.signal,
		),
	).rejects.toThrow("active SQLite sidecar");
	expect(await readFile(join(binary, "ledger.sqlite"))).toEqual(initial);
	expect(await readJson(inquiryBindingPath(workspaceId))).toEqual(before);
	expect(binaryWrites).toBe(0);
});
it("rejects external SHA changes rather than silently adopting or overwriting them", async () => {
	await writeFile(
		join(binary, "ledger.sqlite"),
		Buffer.from("different untrusted bytes"),
	);
	await expect(owner.snapshot()).rejects.toThrow("no automatic adoption");
	expect(binaryWrites).toBe(0);
});
it("rolls back staged invalid domain mutations without creating a pending intent or changing the original", async () => {
	await expect(
		owner.write(
			"invalid-question",
			(service) =>
				service.recordQuestion({
					...question("invalid"),
					projectId: "foreign",
				}),
			controller.signal,
		),
	).rejects.toThrow("Invalid question record");
	expect(await readFile(join(binary, "ledger.sqlite"))).toEqual(initial);
	expect((await state()).value.intent).toBeNull();
});
