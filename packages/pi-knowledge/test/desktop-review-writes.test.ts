import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeOwnerLifecycle } from "../src/core/owner-lifecycle.js";
import { immutableWikiProposalHash } from "../src/core/wiki-policy.js";
import { createKnowledgeReviewWrites } from "../src/desktop/review-writes.js";
import type { KnowledgeReadOwner } from "../src/desktop/read-model.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

it("records a rejected candidate through state CAS without touching the Vault", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-review-write-")));
	roots.push(root);
	const vault = join(root, "Vault");
	await mkdir(vault);
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	const binding = await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const id = randomUUID();
	const after = "<!-- pi-agent:managed:start -->\nSummary\n<!-- pi-agent:managed:end -->";
	const proposal = {
		id,
		vaultId: binding.vaultId,
		bindingRevision: binding.revision,
		project: "alpha",
		path: "Projects/alpha/Wiki/Orchid.md",
		title: "Orchid",
		rationale: "Method summary",
		createdAt: Date.now(),
		before: null,
		beforeHash: null,
		after,
		afterHash: createHash("sha256").update(after).digest("hex"),
		status: "pending",
		sources: [],
		proposalHash: "",
	};
	proposal.proposalHash = immutableWikiProposalHash(proposal);
	let document: { value: unknown; version: string } = { value: proposal, version: "proposal-v1" };
	const calls: string[] = [];
	const capabilities = { async call(name: string, input: unknown) {
		calls.push(name);
		const args = input as { path: string; expectedVersion?: string | null; value?: unknown };
		if (name === "state.readJson") return { kind: "value", ...document };
		if (name === "state.writeJson") {
			expect(args.expectedVersion).toBe("proposal-v1");
			document = { value: args.value, version: "proposal-v2" };
			return null;
		}
		throw new Error(`Unexpected capability ${name}`);
	} };
	const owner: KnowledgeReadOwner = {
		config,
		...createKnowledgeOwnerLifecycle({ async dispose() {} }),
		services: { async getKnowledgeService() { throw new Error("reject must not start the index"); } },
	};
	const result = await createKnowledgeReviewWrites(owner, capabilities, "state-root", true).reject({ revision: binding.revision, id, expectedProposalHash: proposal.proposalHash }, "alpha");
	expect(result).toEqual({ id, status: "rejected", vaultWritten: false, reviewRecorded: true });
	expect(document.value).toMatchObject({ id, status: "rejected", reviewMethod: "human", humanReviewed: true });
	expect(calls).toEqual(["state.readJson", "state.readJson", "state.writeJson"]);
	await owner.dispose();
});

it("rejects before any state write when the host grant is read-only", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-review-write-ro-")));
	roots.push(root);
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	const owner = {
		config,
		...createKnowledgeOwnerLifecycle({ async dispose() {} }),
		services: { async getKnowledgeService() { throw new Error("unreachable"); } },
	} as KnowledgeReadOwner;
	const calls: string[] = [];
	const capabilities = { async call(name: string) { calls.push(name); return { kind: "missing", version: null }; } };
	await expect(Promise.resolve().then(() => createKnowledgeReviewWrites(owner, capabilities, "state-root", false).reject({ revision: 1, id: randomUUID(), expectedProposalHash: "0".repeat(64) }, "alpha"))).rejects.toThrow("write permission");
	expect(calls).toEqual([]);
	await owner.dispose();
});
