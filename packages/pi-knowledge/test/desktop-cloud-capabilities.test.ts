import { createHash } from "node:crypto";
import type {
	PluginRuntimeContext,
	PluginRuntimeFactoryContext,
	PluginRuntimeResource,
} from "@gyoungwe/plugin-api/runtime";
import { expect, it, vi } from "vitest";
import { createCloudHttp, createCloudVault } from "../src/desktop/cloud-capabilities.js";
import { withCloudOperations } from "../src/desktop/cloud-runtime.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const filesRoot = { kind: "files", handle: "fake-files", access: "read-write" } as const;
function missing() {
	return Object.assign(new Error("fake missing file"), { code: "ENOENT" });
}
function vaultState() {
	return {
		binding: {
			version: 1,
			vaultId: "a".repeat(24),
			revision: 7,
			vault: "/fake/vault",
			profile: "hybrid",
			depositMode: "verified",
			subagentPolicy: "none",
			updatedAt: "fake-date",
		},
		remote: "fake remote",
		remoteMissing: false,
		corruptReadback: false,
		writeError: null as Error | null,
	};
}
function capabilityFixture() {
	const locals = new Map<string, string>();
	const state = vaultState();
	const call = vi.fn(async (name: string, input: unknown, _signal?: AbortSignal): Promise<unknown> => {
		const request = input as {
			root: string;
			path: string;
			text: string;
			expectedHash: string | null;
			method: string;
			bodyBase64: string;
		};
		if (name === "credentials.status")
			return { slots: { webdav: { configured: true, authentication: "http-basic-digest" } } };
		if (name === "state.readJson") return { kind: "value", value: { ...state.binding } };
		if (name === "roots.resolve") return { handle: "fake-files" };
		if (name === "files.readText") {
			const text = locals.get(request.path);
			if (text === undefined) throw missing();
			return { text, sha256: hash(text) };
		}
		if (name === "files.ensureDirectory") return null;
		if (name === "files.writeText") {
			if (state.writeError) throw state.writeError;
			const current = locals.get(request.path);
			if ((current === undefined ? null : hash(current)) !== request.expectedHash)
				throw new Error("Plugin file version conflict; reread before writing");
			locals.set(request.path, state.corruptReadback ? "fake mismatch" : request.text);
			return { text: locals.get(request.path) };
		}
		if (name.startsWith("network.")) return networkResponse(state, request);
		throw new Error(`Unexpected capability ${name}`);
	});
	return { locals, state, call };
}
function networkResponse(
	state: ReturnType<typeof vaultState>,
	request: { method: string; bodyBase64: string },
) {
	if (request.method === "PUT") {
		state.remote = Buffer.from(request.bodyBase64, "base64").toString();
		state.remoteMissing = false;
	}
	if (request.method === "PROPFIND")
		return {
			status: 207,
			headers: {},
			base64: Buffer.from(
				'<d:multistatus xmlns:d="DAV:"><d:response><d:href>/Drone-Knowledge/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',
			).toString("base64"),
		};
	return {
		status: state.remoteMissing ? 404 : 200,
		headers: { ETag: '"v1"' },
		base64: Buffer.from(state.remote).toString("base64"),
	};
}
async function fixture(resources: readonly PluginRuntimeResource[] = [filesRoot]) {
	const { locals, state, call } = capabilityFixture();
	const context: PluginRuntimeFactoryContext = {
		applicationId: "fake-app",
		signal: new AbortController().signal,
		resources: [{ kind: "state", handle: "fake-state" }, ...resources],
		capabilities: {
			call: vi.fn(async () => {
				throw new Error("Activation IO forbidden");
			}),
		},
		events: { changed: vi.fn() },
	};
	const caller: PluginRuntimeContext = {
		capabilities: { call },
		scope: { kind: "application" },
		signal: context.signal,
	};
	const vault = createCloudVault(caller.capabilities, "fake-state", resources, caller.signal);
	const runtime = await withCloudOperations(async () => ({ operations: {}, dispose: async () => undefined }))(
		context,
	);
	const sync = (changes: Record<string, unknown> = {}) =>
		runtime.operations.cloudSync.execute(
			{
				mode: "pull",
				bindingRevision: 7,
				paths: ["Home.md"],
				previews: [
					{
						path: "Home.md",
						localHash: locals.has("Home.md") ? hash(String(locals.get("Home.md"))) : null,
						remoteHash: state.remoteMissing ? null : hash(state.remote),
						remoteVersion: state.remoteMissing ? null : '"v1"',
					},
				],
				...changes,
			},
			caller,
		);
	return { locals, state, call, context, caller, vault, sync };
}

it("strips reserved request headers and normalizes response header names", async () => {
	const call = vi.fn(async () => ({
		status: 200,
		headers: { ETag: '"fake"', "Last-Modified": "fake-date" },
		base64: Buffer.from("fake").toString("base64"),
	}));
	const http = createCloudHttp({ call }, new AbortController().signal);
	expect(
		await http.request({
			method: "GET",
			path: "Drone-Knowledge/Home.md",
			headers: { aUtHoRiZaTiOn: "fake-private", Accept: "text/plain" },
		}),
	).toMatchObject({ headers: { etag: '"fake"', "last-modified": "fake-date" } });
	expect(call).toHaveBeenCalledWith(
		"network.read",
		expect.objectContaining({
			headers: { Accept: "text/plain" },
			credential: "webdav",
			httpAuth: { username: "gaoyangwei" },
		}),
		expect.any(AbortSignal),
	);
});

it("rereads and parses binding state including fresh reads", async () => {
	const f = await fixture();
	expect(await f.vault.readBinding()).toMatchObject({ revision: 7 });
	f.state.binding.revision = 8;
	expect(await f.vault.readBinding({ fresh: true })).toMatchObject({ revision: 8 });
	expect(f.call.mock.calls.map(([name, input]) => [name, input])).toEqual(
		Array(2).fill(["state.readJson", { root: "fake-state", path: "binding.json" }]),
	);
	f.call.mockResolvedValueOnce({ kind: "missing" });
	expect(await f.vault.readBinding({ fresh: true })).toBeNull();
	f.call.mockResolvedValueOnce({ kind: "value", value: { version: 1 } });
	await expect(f.vault.readBinding()).rejects.toMatchObject({ code: "protocol" });
});

it("pulls only a selected missing file with absence CAS and verified readback", async () => {
	const f = await fixture();
	f.locals.set("Wiki/unselected.md", "fake unselected");
	expect(await f.sync()).toMatchObject({
		status: "ok",
		result: { completed: true, items: [{ path: "Home.md", status: "pulled", reason: "index_pending" }] },
	});
	expect(f.call).toHaveBeenCalledWith(
		"files.writeText",
		{ root: "fake-files", path: "Home.md", text: "fake remote", expectedHash: null },
		f.caller.signal,
	);
	expect(f.call.mock.calls.filter(([name]) => name === "files.readText")).toHaveLength(2);
	expect(f.locals.get("Wiki/unselected.md")).toBe("fake unselected");
	expect(f.call.mock.calls.every(([, input]) => !JSON.stringify(input).includes("unselected"))).toBe(true);
	expect(f.context.capabilities.call).not.toHaveBeenCalled();
});

it("replaces a selected file using its previewed hash CAS", async () => {
	const f = await fixture();
	f.locals.set("Home.md", "fake local");
	expect(await f.sync({ resolution: "remote" })).toMatchObject({
		status: "ok",
		result: { completed: true, items: [{ status: "pulled" }] },
	});
	expect(f.call).toHaveBeenCalledWith(
		"files.writeText",
		expect.objectContaining({ expectedHash: hash("fake local") }),
		f.caller.signal,
	);
});

it.each([
	{ resources: [] },
	{ resources: [{ ...filesRoot, access: "read" }] },
	{ resources: [{ ...filesRoot, handle: "fake-other" }] },
] as const)("refuses pull mutations without a matching writable root $resources", async ({ resources }) => {
	const f = await fixture(resources);
	expect(await f.sync()).toMatchObject({
		status: "ok",
		result: { completed: false, items: [{ status: "failed", reason: "forbidden" }] },
	});
	expect(
		f.call.mock.calls.some(([name]) => name === "files.writeText" || name === "files.ensureDirectory"),
	).toBe(false);
});

it("maps a missing approved root to forbidden instead of crashing", async () => {
	const f = await fixture();
	f.call.mockImplementationOnce(async () => {
		throw new Error("No approved root");
	});
	await expect(f.vault.containedFile("/fake/vault", "Home.md")).rejects.toMatchObject({ code: "forbidden" });
});

it("preserves a file that appears before create-only CAS", async () => {
	const f = await fixture();
	const target = await f.vault.containedFile("/fake/vault", "Home.md");
	f.locals.set("Home.md", "fake appeared");
	expect(await f.vault.createFileOnly(target, "fake remote")).toBe(false);
	expect(f.locals.get("Home.md")).toBe("fake appeared");
});

it.each([
	[new Error("Plugin file version conflict; reread before writing"), "conflict"],
	[Object.assign(new Error("fake-private-denial"), { code: "EACCES" }), "forbidden"],
])("reports local write failure as %s without error text", async (error, reason) => {
	const f = await fixture();
	f.locals.set("Home.md", "fake local");
	f.state.writeError = error;
	const result = await f.sync({ resolution: "remote" });
	expect(result).toMatchObject({ status: "ok", result: { completed: false, items: [{ reason }] } });
	expect(JSON.stringify(result)).not.toContain("fake-private");
});

it("refuses to report a mismatched local write readback as successful", async () => {
	const f = await fixture();
	f.state.corruptReadback = true;
	expect(await f.sync()).toMatchObject({
		status: "ok",
		result: { completed: false, items: [{ status: "failed", reason: "protocol" }] },
	});
});

it("rejects stale binding and unselected paths before network IO", async () => {
	const f = await fixture();
	expect(await f.sync({ bindingRevision: 6 })).toEqual({ status: "failed", reason: "conflict" });
	expect(await f.sync({ paths: [] })).toEqual({ status: "failed", reason: "protocol" });
	expect(f.call.mock.calls.some(([name]) => name.startsWith("network."))).toBe(false);
});

it("pushes an explicitly selected note through the caller broker without local writes", async () => {
	const f = await fixture([{ ...filesRoot, access: "read" }]);
	f.locals.set("Home.md", "fake local");
	f.state.remoteMissing = true;
	expect(await f.sync({ mode: "push" })).toMatchObject({
		status: "ok",
		result: { completed: true, items: [{ status: "pushed" }] },
	});
	expect(f.state.remote).toBe("fake local");
	expect(f.call.mock.calls.some(([name]) => name === "files.writeText")).toBe(false);
});

it("sanitizes invalid binding state and initial host read failures into protocol results", async () => {
	const f = await fixture();
	f.state.binding.version = 0;
	expect(await f.sync()).toEqual({ status: "failed", reason: "protocol" });
	const respond = f.call.getMockImplementation();
	if (!respond) throw new Error("Expected fake capability responder");
	f.call.mockImplementation(async (name, input, signal) => {
		if (name === "state.readJson") throw new Error("fake-private-host-detail");
		return respond(name, input, signal);
	});
	expect(await f.sync()).toEqual({ status: "failed", reason: "protocol" });
});
