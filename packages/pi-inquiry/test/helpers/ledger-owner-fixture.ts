import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PluginResourceReservations } from "@gyoungwe/plugin-api/node/reservations";
import { it as base } from "vitest";
import {
	type InquiryBindingState,
	InquiryLedgerOwner,
	type InquiryWasmEngine,
	inquiryBindingPath,
	parseInquiryBinding,
} from "../../src/ledger-owner.js";
import { InquiryService } from "../../src/service.js";
import { SqliteInquiryStorage } from "../../src/storage.js";
import { createInquiryWasmEngine } from "../../src/wasm-storage.js";
import { createLedgerOwnerPorts, hash, readJson } from "./ledger-owner-ports.js";

export { hash } from "./ledger-owner-ports.js";

const require = createRequire(import.meta.url);
export const projectId = "original-project",
	workspaceId = "actual-workspace";
const date = "2026-10-28T00:00:00.000Z";
export const question = (id: string) => ({
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

async function createLedgerOwnerState(engine: InquiryWasmEngine) {
	const directory = await realpath(await mkdtemp(join(tmpdir(), "inquiry-owner-")));
	const binary = join(directory, "ledger");
	const json = binary;
	await mkdir(binary);
	const reservations = new PluginResourceReservations(join(directory, "leases"));
	const activeWorkspace = workspaceId;
	const activeDirectory = directory;
	const controller = new AbortController();
	const denyLedgerWrite = false;
	const cancelAfterCommit = false;
	const binaryWrites = 0;
	const seed = new SqliteInquiryStorage(projectId, join(binary, "ledger.sqlite"));
	await new InquiryService(seed).recordQuestion(question("original"));
	await seed.close();
	const initial = await readFile(join(binary, "ledger.sqlite"));
	return {
		engine,
		directory,
		binary,
		json,
		reservations,
		activeWorkspace,
		activeDirectory,
		controller,
		denyLedgerWrite,
		cancelAfterCommit,
		binaryWrites,
		initial,
	};
}

async function createLedgerOwnerFixture(engine: InquiryWasmEngine) {
	const fixture = await createLedgerOwnerState(engine);
	const ports = createLedgerOwnerPorts(fixture);
	const state = async (): Promise<InquiryBindingState> => {
		const path = inquiryBindingPath(),
			result = await readJson(fixture.json, path);
		const value = parseInquiryBinding(result, workspaceId);
		if (result.kind !== "value" || !value) throw new Error("Fixture binding missing");
		return { root: "json", path, value, version: result.version };
	};
	const reopened = () =>
		state().then(
			(binding) =>
				new InquiryLedgerOwner(engine, ports, binding, {
					handle: "binary",
					kind: "binary-state",
					path: fixture.binary,
					access: "read-write",
				}),
		);
	const value = {
		schemaVersion: 1,
		workspaceId,
		projectId,
		binaryPath: fixture.binary,
		originalVersion: hash(fixture.initial),
		headVersion: hash(fixture.initial),
		backupVersion: null,
		intent: null,
	};
	await writeFile(join(fixture.json, inquiryBindingPath()), JSON.stringify(value));
	return Object.assign(fixture, {
		ports,
		owner: await reopened(),
		readJson: (path: string) => readJson(fixture.json, path),
		state,
		reopened,
	});
}

export const it = base.extend<{
	engine: InquiryWasmEngine;
	ledger: Awaited<ReturnType<typeof createLedgerOwnerFixture>>;
}>({
	engine: [
		// biome-ignore lint/correctness/noEmptyPattern: Vitest requires destructuring for fixtures without dependencies.
		async ({}, use) => {
			await use(await createInquiryWasmEngine(await readFile(require.resolve("sql.js/dist/sql-wasm.wasm"))));
		},
		{ scope: "file" },
	],
	ledger: async ({ engine }, use) => {
		const fixture = await createLedgerOwnerFixture(engine);
		try {
			await use(fixture);
		} finally {
			await fixture.owner.dispose();
			fixture.reservations.dispose();
			await rm(fixture.directory, { recursive: true, force: true });
		}
	},
});
