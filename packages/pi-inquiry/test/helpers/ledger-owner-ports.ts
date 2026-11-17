import { createHash } from "node:crypto";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { readBinaryStateFile, writeBinaryStateFile } from "@gyoungwe/plugin-api/node/binary-state";
import type { PluginResourceReservations } from "@gyoungwe/plugin-api/node/reservations";
import type { PluginRuntimeCapabilities, PluginStateReadResult } from "@gyoungwe/plugin-api/runtime";

export const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

type LedgerOwnerPortState = {
	binary: string;
	json: string;
	reservations: PluginResourceReservations;
	activeWorkspace: string;
	activeDirectory: string;
	controller: AbortController;
	denyLedgerWrite: boolean;
	cancelAfterCommit: boolean;
	binaryWrites: number;
};
type StateRequest = {
	root: string;
	path: string;
	base64: string;
	expectedVersion: string | null;
	assertAbsent: string[];
	value: unknown;
};

export async function readJson(json: string, path: string): Promise<PluginStateReadResult> {
	try {
		const text = await readFile(join(json, path), "utf8");
		return { kind: "value", value: JSON.parse(text), version: hash(text) };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return { kind: "missing", version: null };
	}
}

function createAccess(fixture: LedgerOwnerPortState) {
	const resolvePath = async (path: string) => {
		if (
			isAbsolute(path) ||
			path.includes("\\") ||
			path.split("/").some((part) => part === ".." || part === ".")
		)
			throw new Error("Fixture path confinement");
		let current = fixture.binary;
		for (const part of path ? path.split("/") : []) {
			current = join(current, part);
			try {
				if ((await lstat(current)).isSymbolicLink()) throw new Error("Fixture symlink refusal");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		const suffix = relative(fixture.binary, current);
		if (suffix === ".." || suffix.startsWith(`..${sep}`)) throw new Error("Fixture path confinement");
		return current;
	};
	return {
		resolvePath,
		checkRoot: async () => {
			await lstat(fixture.binary);
		},
		checkWrite: async () => {
			fixture.controller.signal.throwIfAborted();
		},
		assertReserved: (parent: string) => fixture.reservations.assertReserved("state-writers", parent),
		conflictError: () => new Error("CAS conflict"),
		cleanupFailed: (error: unknown) => {
			throw error;
		},
	};
}

async function writeBinary(
	fixture: LedgerOwnerPortState,
	request: StateRequest,
	signal: AbortSignal | undefined,
	access: ReturnType<typeof createAccess>,
) {
	if (request.path === "ledger.sqlite" && fixture.denyLedgerWrite)
		throw new Error("Actual fixture write denied");
	const result = await writeBinaryStateFile(request, {
		signal: signal ?? fixture.controller.signal,
		serialize: (operation) => operation(),
		prepare: () => access,
	});
	fixture.binaryWrites++;
	if (request.path === "ledger.sqlite" && fixture.cancelAfterCommit) {
		fixture.controller.abort(new Error("Caller revoked after actual commit"));
		const error = new Error("Actual fixture postcommit unknown");
		Object.assign(error, { code: "EBINARYWRITEOUTCOMEUNKNOWN" });
		throw error;
	}
	return result;
}

async function writeJson(fixture: LedgerOwnerPortState, request: StateRequest) {
	const current = await readJson(fixture.json, request.path);
	if (current.version !== request.expectedVersion) throw new Error("Metadata CAS conflict");
	const text = JSON.stringify(request.value);
	const temporary = join(fixture.json, `${request.path}.tmp`);
	await writeFile(temporary, text, { flag: "wx" });
	fixture.controller.signal.throwIfAborted();
	await rename(temporary, join(fixture.json, request.path));
	return readJson(fixture.json, request.path);
}

export function createLedgerOwnerPorts(fixture: LedgerOwnerPortState): PluginRuntimeCapabilities {
	const access = createAccess(fixture);
	return {
		async call(name, input, signal) {
			fixture.controller.signal.throwIfAborted();
			if (name === "roots.describe")
				return [
					{
						handle: "binary",
						kind: "binary-state",
						path: fixture.binary,
						access: "read-write",
					},
					{ handle: "json", kind: "state", path: fixture.json, access: "read-write" },
				];
			if (name === "caller.scope")
				return {
					kind: "session",
					workspaceId: fixture.activeWorkspace,
					workspaceDirectory: fixture.activeDirectory,
					sessionId: "actual-fixture-sdk",
				};
			const request = input as StateRequest;
			if (name === "state.reserve") {
				fixture.reservations.reserve("state-writers", [
					request.root === "binary" ? fixture.binary : fixture.json,
				]);
				return { reserved: true };
			}
			if (name === "state.readBinary") return readBinaryStateFile(request.path, access);
			if (name === "state.writeBinary") return writeBinary(fixture, request, signal, access);
			if (name === "state.readJson") return readJson(fixture.json, request.path);
			if (name === "state.writeJson") return writeJson(fixture, request);
			throw new Error(`Fixture capability unavailable: ${name}`);
		},
	};
}
