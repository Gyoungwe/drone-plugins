import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeOwnerLifecycle } from "../src/core/owner-lifecycle.js";
import { immutableWikiProposalHash } from "../src/core/wiki-policy.js";
import { createKnowledgeReviewModel } from "../src/desktop/reviews.js";
import { createKnowledgeWikiReview } from "../src/core/wiki-review.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createBrokerWikiReviewPorts } from "../src/desktop/review-storage.js";
import { createLocalWikiReviewPorts } from "../src/core/wiki-review-node.js";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("records a rejected candidate through state CAS without touching the Vault", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-review-write-")));
	roots.push(root);
	const vault = join(root, "Vault");
	await mkdir(vault);
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	const binding = await config.saveKnowledgeBinding({
		vault,
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
	});
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
	const capabilities = {
		async call(name: string, input: unknown) {
			calls.push(name);
			const args = input as { path: string; expectedVersion?: string | null; value?: unknown };
			if (name === "state.readJson")
				return args.path.includes("/reviewed/") ? { kind: "missing" } : { kind: "value", ...document };
			if (name === "state.ensureDirectory") return { created: true };
			if (name === "state.writeJson") {
				expect(args.expectedVersion).toBeNull();
				document = { value: args.value, version: "proposal-v2" };
				return { kind: "value", ...document };
			}
			if (name === "state.removeJson") {
				expect(args.expectedVersion).toBe("proposal-v2");
				return { kind: "missing" };
			}
			throw new Error(`Unexpected capability ${name}`);
		},
	};
	const host = createKnowledgeRuntimeHost();
	const owner = {
		wiki: createKnowledgeWikiReview(
			host,
			config,
			{ readReviewMode: async () => "strict" },
			{ invalidateKnowledgeUi() {} },
			createBrokerWikiReviewPorts(capabilities, "state-root"),
		),
		config,
		...createKnowledgeOwnerLifecycle({ async dispose() {} }),
		services: {
			async getKnowledgeService() {
				throw new Error("reject must not start the index");
			},
		},
	};
	const result = await createKnowledgeReviewModel(owner, true, false).rejectReview(
		{ revision: binding.revision, id, expectedProposalHash: proposal.proposalHash },
		"alpha",
	);
	expect(result).toEqual({ id, status: "rejected", vaultWritten: false, reviewRecorded: true });
	expect(document.value).toMatchObject({
		id,
		status: "rejected",
		reviewMethod: "human",
		humanReviewed: true,
	});
	expect(calls).toContain("state.removeJson");
	await owner.dispose();
});

it("rejects before any state write when the host grant is read-only", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-review-write-ro-")));
	roots.push(root);
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	const owner = {
		wiki: createKnowledgeWikiReview(
			createKnowledgeRuntimeHost(),
			config,
			{ readReviewMode: async () => "strict" },
			{ invalidateKnowledgeUi() {} },
			createLocalWikiReviewPorts(config),
		),
		config,
		...createKnowledgeOwnerLifecycle({ async dispose() {} }),
		services: {
			async getKnowledgeService() {
				throw new Error("unreachable");
			},
		},
	};

	await expect(
		Promise.resolve().then(() =>
			createKnowledgeReviewModel(owner, false, false).rejectReview(
				{ revision: 1, id: randomUUID(), expectedProposalHash: "0".repeat(64) },
				"alpha",
			),
		),
	).rejects.toThrow("write permission");
	await expect(
		Promise.resolve().then(() =>
			createKnowledgeReviewModel(owner, true, false).applyReview(
				{ revision: 1, id: randomUUID(), expectedProposalHash: "0".repeat(64) },
				"alpha",
			),
		),
	).rejects.toThrow("Vault write permission");
	await owner.dispose();
});
