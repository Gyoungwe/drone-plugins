import { describe, expect, it } from "vitest";
import { localApiSearchByDoi, probeZoteroConnector } from "../src/core/zotero-write-runtime.js";
import { capabilityFetch } from "../src/desktop/capability-fetch.js";

/** A host that answers network.read/write the way Drone's network capabilities do. */
function host(
	respond: (request: any) => { status: number; headers?: Record<string, string>; body?: string },
) {
	const calls: { name: string; input: any; signal?: AbortSignal }[] = [];
	const call = async (name: string, input: any, signal?: AbortSignal) => {
		calls.push({ name, input, signal });
		const { status, headers = {}, body = "" } = respond(input);
		return { status, headers, base64: Buffer.from(body).toString("base64"), bytes: Buffer.byteLength(body) };
	};
	return { calls, fetch: capabilityFetch(call) };
}
const decode = (input: any) => Buffer.from(input.bodyBase64 ?? "", "base64").toString("utf8");

describe("capability fetch", () => {
	it("routes Zotero connector writes through network.write with the JSON body intact", async () => {
		const h = host(() => ({ status: 200, headers: { "content-type": "application/json" }, body: "{}" }));
		expect(await probeZoteroConnector({ fetchImpl: h.fetch })).toMatchObject({ reachable: true });
		expect(h.calls).toHaveLength(1);
		expect(h.calls[0]).toMatchObject({
			name: "network.write",
			input: {
				method: "POST",
				url: "http://127.0.0.1:23119/connector/ping",
				headers: expect.objectContaining({ "content-type": "application/json" }),
			},
		});
		expect(JSON.parse(decode(h.calls[0].input))).toEqual({});
	});

	it("routes local API reads through network.read and returns the host's response to the runtime", async () => {
		const item = { key: "ABCD2345", data: { DOI: "10.1000/xyz", title: "A paper" } };
		const h = host(() => ({
			status: 200,
			headers: { "content-type": "application/json", "total-results": "1" },
			body: JSON.stringify([item]),
		}));
		const found = await localApiSearchByDoi({ fetchImpl: h.fetch, doi: "10.1000/xyz" });
		expect(h.calls[0]).toMatchObject({ name: "network.read", input: { method: "GET" } });
		expect(h.calls[0].input.bodyBase64).toBeUndefined();
		expect(new URL(h.calls[0].input.url).host).toBe("127.0.0.1:23119");
		expect(found).toMatchObject({ complete: true, items: [{ key: "ABCD2345" }] });
	});

	it("serializes form bodies with their content type and passes the caller's signal", async () => {
		const h = host(() => ({ status: 204 }));
		const controller = new AbortController();
		const response = await h.fetch("https://api.zotero.org/users/1/items/K/file", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ upload: "u1" }).toString(),
			signal: controller.signal,
		});
		expect(response.status).toBe(204);
		expect(decode(h.calls[0].input)).toBe("upload=u1");
		controller.abort();
		expect(h.calls[0].signal?.aborted).toBe(true);
	});

	it("surfaces a host refusal as the fetch rejection", async () => {
		const call = async () => {
			throw new Error("Network host is not declared in this package's manifest: example.com");
		};
		await expect(capabilityFetch(call)("https://example.com/")).rejects.toThrow("not declared");
	});
});
