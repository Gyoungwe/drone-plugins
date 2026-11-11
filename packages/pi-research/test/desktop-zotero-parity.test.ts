import { afterEach, expect, it, vi } from "vitest";
import type { CapabilityCall } from "../src/desktop/capability-fetch.js";
import { registerManagedZoteroTools, updateInZotero } from "../src/desktop/zotero-tools.js";

const DOI = "10.1000/t18.parity";
const UPDATE = { zotero_key: "ABCD1234", collection_key: "COLL1234" };

interface ManagedTool {
	name: string;
	execute(
		id: string,
		params: Record<string, unknown>,
		signal?: AbortSignal,
		update?: unknown,
		ctx?: { cwd: string },
	): Promise<{ content: { text: string }[]; details: Record<string, unknown> }>;
}

function registeredTools(call: CapabilityCall) {
	const tools: ManagedTool[] = [];
	registerManagedZoteroTools({ registerTool: (tool) => tools.push(tool as ManagedTool) }, call);
	return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
	return {
		status,
		headers: { "content-type": "application/json", ...headers },
		base64: Buffer.from(JSON.stringify(value)).toString("base64"),
	};
}

function localUpdateHost(writeError: Error) {
	const writes: string[] = [];
	const call: CapabilityCall = async (name, request) => {
		if (name === "credentials.status")
			return {
				slots: { "zotero-local": { configured: true, fields: { serverId: "TESTSERVER1" } } },
			};
		const input = request as { url: string; method: string };
		const path = new URL(input.url).pathname;
		if (name === "network.write") throw writeError;
		if (["PATCH", "POST"].includes(input.method)) writes.push(`${input.method} ${path}`);
		if (path === "/connector/ping") return json({});
		if (path === "/connector/getSelectedCollection") throw writeError;
		if (path === "/api/") return json({}, 200, { "zotero-server-id": "TESTSERVER1" });
		if (path === "/api/users/0/items/ABCD1234")
			return json({ key: "ABCD1234", version: 1, data: { DOI, title: "Parity", collections: [] } });
		if (path === "/api/users/0/collections")
			return json([{ key: "COLL1234", data: { name: "Reading", parentCollection: false } }]);
		if (path.endsWith("/children")) return json([]);
		throw new Error(`Unexpected Zotero request ${input.method} ${path}`);
	};
	return { call, writes };
}

interface NetworkRequest {
	url: string;
	method: string;
	bodyBase64: string;
	allowance?: string;
}

interface Allowance {
	id: string;
	member: string;
	consent: { slot?: boolean; doi?: string };
	used: boolean;
}

function connectorHost(allowances: Allowance[], write: (request: NetworkRequest) => Promise<void>) {
	const writes: NetworkRequest[] = [];
	const items = new Map<string, unknown>();
	const call: CapabilityCall = async (name, request) => {
		if (name === "credentials.status") return { slots: {} };
		if (name === "task.grant.allowances") return { allowances: allowances.map((item) => ({ ...item })) };
		const input = request as NetworkRequest;
		const url = new URL(input.url);
		if (url.pathname === "/connector/ping") return json({});
		if (url.pathname === "/connector/getSelectedCollection")
			return json({ libraryID: 1, libraryName: "My Library", libraryEditable: true });
		if (name === "network.write") {
			writes.push(input);
			await write(input);
			const { items: saved } = JSON.parse(Buffer.from(input.bodyBase64, "base64").toString("utf8"));
			const doi: string = saved[0].DOI;
			items.set(doi, { key: "ABCD1234", data: { DOI: doi, title: saved[0].title } });
			const allowance = allowances.find((item) => item.id === input.allowance);
			if (allowance) allowance.used = true;
			return json({}, 201);
		}
		if (url.pathname === "/api/users/0/items") {
			const item = items.get(url.searchParams.get("q") ?? "");
			return json(item ? [item] : [], 200, { "total-results": item ? "1" : "0" });
		}
		if (url.pathname.endsWith("/children")) return json([]);
		throw new Error(`Unexpected Zotero request ${input.method} ${url.pathname}`);
	};
	return { call, writes };
}

function gate() {
	let release: () => void;
	const wait = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { wait, release: () => release() };
}

const slot = (id: string): Allowance => ({ id, member: "zotero_item", consent: { slot: true }, used: false });

async function concurrentSaves(allowances: Allowance[], dois: string[]) {
	const started = gate();
	const finish = gate();
	const host = connectorHost(allowances, async () => {
		if (host.writes.length === 2) started.release();
		await finish.wait;
	});
	const save = registeredTools(host.call).research_zotero_save;
	const pending = dois.map((doi, index) => save.execute(`save-${index}`, { doi, title: "Parity" }));
	await started.wait;
	const requested = host.writes.map((request) => request.allowance);
	finish.release();
	return { requested, results: await Promise.all(pending) };
}

afterEach(() => vi.useRealTimers());

it("returns a cancelled update when the host denies the write before Zotero receives it", async () => {
	const host = localUpdateHost(new Error("Plugin capability denied: network.write"));
	const receipt = await updateInZotero(host.call, UPDATE, "/project");
	expect(receipt).toMatchObject({
		status: "cancelled",
		reason: "user-declined",
		consent: { via: "host-dialog" },
		write: { performed: false },
	});
	expect(host.writes).toEqual([]);
});

it("rethrows an update failure unchanged when the host did not deny the write", async () => {
	const failure = new TypeError("Network unavailable");
	await expect(updateInZotero(localUpdateHost(failure).call, UPDATE, "/project")).rejects.toBe(failure);
});

it.each(["save", "update"])("returns a failed %s card without leaking the thrown message", async (action) => {
	const fakeKey = "fake-key-for-t18-only";
	const host = localUpdateHost(new TypeError(`Network failure containing ${fakeKey}`));
	const result = await registeredTools(host.call)[`research_zotero_${action}`].execute(
		action,
		{ ...UPDATE, doi: "https://doi.org/10.1000/T18.Parity", title: "Parity" },
		undefined,
		undefined,
		{ cwd: "/project" },
	);
	const receipt = JSON.parse(result.content[0].text);
	expect(receipt).toEqual({
		status: "failed",
		doi: DOI,
		error: "TypeError: Zotero write failed.",
		next: "Do not retry automatically. Inspect Zotero or ask the user before any further write.",
	});
	expect(result.details).toEqual({
		...receipt,
		cards: [expect.objectContaining({ key: `doi:${DOI}`, status: "failed", tone: "error" })],
	});
	expect(receipt).not.toHaveProperty("cards");
	expect(JSON.stringify(result)).not.toContain(fakeKey);
});

it("omits a failure card when an update has no DOI", async () => {
	const result = await registeredTools(
		localUpdateHost(new Error("Network unavailable")).call,
	).research_zotero_update.execute("update", UPDATE, undefined, undefined, { cwd: "/project" });
	expect(result.details).toMatchObject({ status: "failed", doi: null });
	expect(result.details).not.toHaveProperty("cards");
	expect(result.details).toEqual(JSON.parse(result.content[0].text));
});

it("propagates AbortError from an update instead of returning a failure card", async () => {
	const abort = new DOMException("Cancelled", "AbortError");
	await expect(
		registeredTools(localUpdateHost(abort).call).research_zotero_update.execute(
			"update",
			{ ...UPDATE, doi: DOI },
			undefined,
			undefined,
			{ cwd: "/project" },
		),
	).rejects.toBe(abort);
});

it("propagates cancellation even when save returns a receipt after catching AbortError", async () => {
	vi.useFakeTimers();
	const controller = new AbortController();
	const abort = new DOMException("Cancelled", "AbortError");
	const host = connectorHost([], async () => {
		controller.abort(abort);
		throw abort;
	});
	const pending = registeredTools(host.call).research_zotero_save.execute(
		"save",
		{ doi: DOI, title: "Parity" },
		controller.signal,
	);
	await Promise.all([expect(pending).rejects.toBe(abort), vi.runAllTimersAsync()]);
});

it.each([
	{ count: 2, expected: ["slot-1", "slot-2"], consent: "task-grant" },
	{ count: 1, expected: ["slot-1", undefined], consent: "host-dialog" },
])(
	"reserves DOI-less slots for concurrent saves with $count available",
	async ({ count, expected, consent }) => {
		const { requested, results } = await concurrentSaves(
			Array.from({ length: count }, (_, index) => slot(`slot-${index + 1}`)),
			[DOI, "10.1000/t18.second"],
		);
		expect(requested).toEqual(expected);
		expect(results.map((result) => result.details.status)).toEqual(["saved", "saved"]);
		expect(results[1].details.consent).toMatchObject({ via: consent });
	},
);

it("releases an unused slot after a failed save so a later save can use it", async () => {
	vi.useFakeTimers();
	const started = gate();
	const finish = gate();
	const host = connectorHost([slot("slot-1")], async () => {
		if (host.writes.length === 1) {
			started.release();
			await finish.wait;
			throw new Error("Network unavailable before the allowance was consumed");
		}
	});
	const save = registeredTools(host.call).research_zotero_save;
	const first = save.execute("first", { doi: DOI, title: "Parity" });
	await started.wait;
	const second = await save.execute("second", { doi: "10.1000/t18.second", title: "Parity" });
	finish.release();
	const [failed] = await Promise.all([first, vi.runAllTimersAsync()]);
	const third = await save.execute("third", { doi: "10.1000/t18.third", title: "Parity" });
	expect(failed.details.status).toBe("failed");
	expect(second.details.consent).toEqual({ via: "host-dialog" });
	expect(third.details.status).toBe("saved");
	expect(host.writes.map((request) => request.allowance)).toEqual(["slot-1", undefined, "slot-1"]);
});

it("keeps named DOI allowances ahead of paper slots during concurrent saves", async () => {
	const { requested } = await concurrentSaves(
		[slot("slot-1"), { id: "named", member: "zotero_item", consent: { doi: DOI }, used: false }],
		[DOI, DOI],
	);
	expect(requested).toEqual(["named", "named"]);
});

it("keeps in-flight slot reservations within each registered tool set", async () => {
	const started = gate();
	const finish = gate();
	const host = connectorHost([slot("slot-1")], async () => {
		if (host.writes.length === 1) {
			started.release();
			await finish.wait;
		}
	});
	const first = registeredTools(host.call).research_zotero_save.execute("first", {
		doi: DOI,
		title: "Parity",
	});
	await started.wait;
	await registeredTools(host.call).research_zotero_save.execute("second", {
		doi: "10.1000/t18.second",
		title: "Parity",
	});
	finish.release();
	await first;
	expect(host.writes.map((request) => request.allowance)).toEqual(["slot-1", "slot-1"]);
});
