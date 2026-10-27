import { describe, expect, it } from "vitest";
import {
	createResearchConnectorHostLoader,
	researchConnectorHostLoader,
	researchWriteAdapterHostLoader,
} from "../src/research-host.js";

describe("research host contract seam", () => {
	it("fails closed when connector transport is not supplied by the host", async () => {
		const host = researchConnectorHostLoader.load();
		expect(host.contractVersion).toBe(1);
		expect(host.status).toBe("unavailable");
		expect(host.list()).toEqual([]);
		await expect(host.search({ query: "enzyme" })).rejects.toThrow(/transport is unavailable/);
		await expect(host.recommend("seed", "crossref")).rejects.toThrow(/transport is unavailable/);
	});

	it("fails closed for writes until the host supplies an authorized adapter", async () => {
		const host = researchWriteAdapterHostLoader.load();
		expect(host.contractVersion).toBe(1);
		expect(host.status).toBe("unavailable");
		expect(host.descriptors()).toEqual([]);
		expect(() =>
			host.prepare({
				adapterId: "zotero-write",
				targetRef: "library",
				payload: { title: "test" },
				action: "prepare",
			}),
		).toThrow(/write adapters are unavailable/);
	});

	it("loads real read-only public and project connectors from host-owned transports", async () => {
		const calls: string[] = [];
		const fetchImpl: typeof fetch = async (input) => {
			const url = String(input);
			calls.push(url);
			if (url.includes("export.arxiv.org")) {
				return new Response(
					`<?xml version="1.0"?><feed><entry><id>http://arxiv.org/abs/2401.01234</id><title>ArXiv read-only record</title><summary>Public preprint metadata</summary><author><name>Grace Hopper</name></author><published>2024-01-01T00:00:00Z</published></entry></feed>`,
					{ status: 200, headers: { "content-type": "application/atom+xml" } },
				);
			}
			return new Response(
				JSON.stringify({
					data: [
						{
							paperId: "paper-1",
							title: "A real Semantic Scholar record",
							abstract: "Read-only metadata from the public connector",
							authors: [{ name: "Ada Lovelace" }],
							year: 1843,
							externalIds: { DOI: "10.1000/example" },
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		};
		const projectStorage = {
			search: async (input: { readonly cwd: string; readonly query: string; readonly limit: number }) => {
				expect(input).toMatchObject({ cwd: "/workspace", query: "methods", limit: 2 });
				return [
					{
						relativePath: "notes/methods.md",
						title: "Methods note",
						summary: "Project-local evidence",
						contentHash: "sha256:methods",
					},
				];
			},
		};
		const host = createResearchConnectorHostLoader({ fetchImpl, projectStorage }).load();
		expect(host.status).toBe("ready");
		expect(host.list()).toEqual([
			{ id: "semantic-scholar", kind: "literature", label: "Semantic Scholar", enabled: true },
			{ id: "arxiv", kind: "literature", label: "arXiv", enabled: true },
			{ id: "project-storage", kind: "project-storage", label: "Project files", enabled: true },
		]);

		const publicResult = await host.search({ query: "enzyme", connectorIds: ["semantic-scholar"], limit: 2 });
		expect(publicResult.complete).toBe(true);
		expect(publicResult.hits[0]).toMatchObject({
			id: "semantic-scholar:paper-1",
			title: "A real Semantic Scholar record",
			doi: "10.1000/example",
			sourceReceipt: { readOnly: true, sourceType: "literature" },
		});
		expect(calls[0]).toContain("api.semanticscholar.org/graph/v1/paper/search");
		const arxivResult = await host.search({ query: "preprint", connectorIds: ["arxiv"], limit: 1 });
		expect(arxivResult.hits[0]).toMatchObject({
			id: "arxiv:2401.01234",
			title: "ArXiv read-only record",
			arxivId: "2401.01234",
			sourceReceipt: { readOnly: true, sourceType: "literature" },
		});

		const projectResult = await host.search({ query: "methods", cwd: "/workspace", connectorIds: ["project-storage"], limit: 2 });
		expect(projectResult.complete).toBe(true);
		expect(projectResult.hits[0]).toMatchObject({
			id: expect.stringMatching(/^project-storage:/u),
			locator: "notes/methods.md",
			sourceReceipt: { readOnly: true, contentHash: "sha256:methods" },
		});
	});
});
