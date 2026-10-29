import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { KnowledgeDepositMode } from "../src/core/config.js";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeWikiReview } from "../src/core/wiki-review.js";
import { createLocalWikiReviewPorts } from "../src/core/wiki-review-node.js";
import { immutableWikiProposalHash } from "../src/core/wiki-policy.js";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

async function fixture(before: string | null = null, depositMode: KnowledgeDepositMode = "verified") {
	const root = await realpath(await mkdtemp(join(tmpdir(), "wiki-review-owner-")));
	roots.push(root);
	const vault = join(root, "Vault");
	await mkdir(join(vault, "Wiki"), { recursive: true });
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	const binding = await config.saveKnowledgeBinding({
		vault,
		profile: "hybrid",
		depositMode,
		subagentPolicy: "none",
	});
	const io = createLocalWikiReviewPorts(config);
	const host = createKnowledgeRuntimeHost();
	const wiki = createKnowledgeWikiReview(
		host,
		config,
		{ readReviewMode: async () => "strict" },
		{ invalidateKnowledgeUi() {} },
		io,
	);
	const path = "Wiki/Owner.md";
	const after =
		"# Owner\n\n<!-- pi-agent:managed:start -->\nNew evidence summary.\n<!-- pi-agent:managed:end -->\n";
	const proposal: any = {
		id: randomUUID(),
		status: "pending",
		vaultId: binding.vaultId,
		bindingRevision: binding.revision,
		project: "alpha",
		path,
		title: "Owner",
		rationale: "Evidence summary",
		createdAt: Date.now(),
		before,
		beforeHash: before === null ? null : hash(before),
		after,
		afterHash: hash(after),
		sources: [],
	};
	proposal.proposalHash = immutableWikiProposalHash(proposal);
	await io.state.write(`${binding.vaultId}/wiki-review/pending/${proposal.id}.json`, proposal, null);
	if (before !== null) await writeFile(join(vault, path), before);
	const requests: string[] = [];
	const service = {
		binding,
		async request(op: string) {
			requests.push(op);
			return {};
		},
	};
	return { root, vault, config, binding, io, wiki, proposal, service, requests };
}

it.each([null, "# Owner\n\nHuman paragraph.\n"])(
	"uses one complete owner to apply, record history and undo (before=%s)",
	async (before) => {
		const f = await fixture(before);
		const result = await f.wiki.decideWikiProposal(
			f.service,
			f.proposal.id,
			"alpha",
			f.proposal.proposalHash,
			"apply",
		);
		expect(result).toMatchObject({
			vaultWritten: true,
			reviewRecorded: true,
			indexed: true,
			recovered: false,
		});
		expect(await readFile(join(f.vault, f.proposal.path), "utf8")).toBe(f.proposal.after);
		expect(await f.wiki.wikiHistory(f.service, "alpha")).toEqual([
			expect.objectContaining({ id: f.proposal.id, afterHash: f.proposal.afterHash }),
		]);
		await expect(
			f.wiki.undoWikiUpdate(f.service, "alpha", f.proposal.id, f.proposal.afterHash),
		).resolves.toMatchObject({ status: "reverted" });
		if (before === null)
			await expect(readFile(join(f.vault, f.proposal.path), "utf8")).rejects.toHaveProperty("code", "ENOENT");
		else expect(await readFile(join(f.vault, f.proposal.path), "utf8")).toBe(before);
		expect(await f.wiki.wikiHistory(f.service, "alpha")).toEqual([]);
		expect(f.requests).toEqual(["changed", "changed"]);
	},
);

it("refuses undo after a real human edit and preserves it", async () => {
	const f = await fixture();
	await f.wiki.decideWikiProposal(f.service, f.proposal.id, "alpha", f.proposal.proposalHash, "apply");
	await writeFile(join(f.vault, f.proposal.path), "# Human changed this\n");
	await expect(
		f.wiki.undoWikiUpdate(f.service, "alpha", f.proposal.id, f.proposal.afterHash),
	).rejects.toThrow("overwrite edits");
	expect(await readFile(join(f.vault, f.proposal.path), "utf8")).toBe("# Human changed this\n");
});

it("recovers a completed Vault write when recording the review failed", async () => {
	const f = await fixture();
	const write = f.io.state.write;
	let fail = true;
	f.io.state.write = async (path, value, expected) => {
		if (fail && path.includes("/reviewed/")) {
			fail = false;
			throw new Error("state unavailable");
		}
		return write(path, value, expected);
	};
	const first = await f.wiki.decideWikiProposal(
		f.service,
		f.proposal.id,
		"alpha",
		f.proposal.proposalHash,
		"apply",
	);
	expect(first).toMatchObject({
		vaultWritten: true,
		reviewRecorded: false,
		recordError: "state unavailable",
	});
	const retry = await f.wiki.decideWikiProposal(
		f.service,
		f.proposal.id,
		"alpha",
		f.proposal.proposalHash,
		"apply",
	);
	expect(retry).toMatchObject({ recovered: true, reviewRecorded: true, indexed: true });
});

it("rejects run-only mode without creating a Wiki page", async () => {
	const f = await fixture(null, "run-only");
	await expect(
		f.wiki.decideWikiProposal(f.service, f.proposal.id, "alpha", f.proposal.proposalHash, "apply"),
	).rejects.toThrow("run-only");
	await expect(readFile(join(f.vault, f.proposal.path))).rejects.toHaveProperty("code", "ENOENT");
});

it.each(["binding", "proposal", "target", "source", "project"])(
	"rejects a stale or out-of-scope %s before touching the reviewed page",
	async (kind) => {
		const before = "# Owner\n\nOriginal human paragraph.\n";
		const f = await fixture(before);
		const source = "Library/Methods/source.md";
		if (kind === "source") {
			await mkdir(join(f.vault, "Library/Methods"), { recursive: true });
			await writeFile(join(f.vault, source), "# Source\nFirst version.\n");
			f.proposal.sources = [
				{
					path: source,
					hash: hash("# Source\nFirst version.\n"),
					startLine: 1,
					endLine: 2,
					excerptHash: hash("# Source\nFirst version.\n"),
				},
			];
			f.proposal.proposalHash = immutableWikiProposalHash(f.proposal);
			const path = `${f.binding.vaultId}/wiki-review/pending/${f.proposal.id}.json`;
			const current = await f.io.state.read(path);
			await f.io.state.write(path, f.proposal, current!.version);
			await writeFile(join(f.vault, source), "# Source\nNew evidence version.\n");
		}
		if (kind === "binding")
			await f.config.saveKnowledgeBinding(
				{ vault: f.vault, profile: "hybrid", depositMode: "rich", subagentPolicy: "none" },
				f.binding.revision,
			);
		if (kind === "target") await writeFile(join(f.vault, f.proposal.path), "# Human edit\n");
		await expect(
			f.wiki.decideWikiProposal(
				f.service,
				f.proposal.id,
				kind === "project" ? "beta" : "alpha",
				kind === "proposal" ? "0".repeat(64) : f.proposal.proposalHash,
				"apply",
			),
		).rejects.toThrow(
			{
				binding: "binding changed",
				proposal: "reviewed candidate changed",
				target: "Wiki changed after preview",
				source: "Source changed since proposal",
				project: "different project",
			}[kind],
		);
		expect(await readFile(join(f.vault, f.proposal.path), "utf8")).toBe(
			kind === "target" ? "# Human edit\n" : before,
		);
	},
);

it("rechecks binding and file CAS at the actual Node commit boundary", async () => {
	const f = await fixture("# Owner\nOriginal.\n");
	const write = f.io.files.write;
	f.io.files.write = (binding, path, text, expected, check) =>
		write(binding, path, text, expected, async () => {
			await check();
			await writeFile(join(f.vault, path), "# Editor won the race\n");
		});
	await expect(
		f.wiki.decideWikiProposal(f.service, f.proposal.id, "alpha", f.proposal.proposalHash, "apply"),
	).rejects.toThrow("changed during review");
	expect(await readFile(join(f.vault, f.proposal.path), "utf8")).toBe("# Editor won the race\n");
});

it("preserves the persisted review record shape and fails visibly for corrupt history", async () => {
	const f = await fixture();
	await f.wiki.decideWikiProposal(f.service, f.proposal.id, "alpha", f.proposal.proposalHash, "apply");
	const path = join(f.root, "state", f.binding.vaultId, "wiki-review/reviewed", `${f.proposal.id}.json`);
	const record = JSON.parse(await readFile(path, "utf8"));
	expect(record).toMatchObject({
		...f.proposal,
		status: "applied",
		reviewMethod: "human",
		modelReview: null,
		humanReviewed: true,
		scientificallyVerified: false,
	});
	expect(typeof record.reviewedAt).toBe("number");
	await writeFile(path, "{");
	await expect(f.wiki.wikiHistory(f.service, "alpha")).rejects.toThrow(SyntaxError);
});
