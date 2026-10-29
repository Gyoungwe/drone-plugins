import { Worker } from "node:worker_threads";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeRuntime } from "../src/core/knowledge-runtime.js";
import { immutableWikiProposalHash } from "../src/core/wiki-policy.js";
import { createKnowledgeWikiReview } from "../src/core/wiki-review.js";
import { createBrokerWikiReviewPorts } from "../src/desktop/review-storage.js";
import { readNoteFile, inspectNote } from "../src/core/files.js";
import { createKnowledgeReviewModel } from "../src/desktop/reviews.js";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

it("shares CLI review projection through broker state and real SQLite with scope, version and revocation checks", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-review-read-")));
	const vault = join(root, "Vault"),
		state = join(root, "state");
	await mkdir(join(vault, "Library/Methods"), { recursive: true });
	const note = "# Orchid\nControlled method.\n";
	await writeFile(join(vault, "Library/Methods/orchid.md"), note);
	const config = createKnowledgeConfigApi(undefined, state);
	const binding = await config.saveKnowledgeBinding({
		vault,
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
	});
	const host = createKnowledgeRuntimeHost();
	host.configureKnowledgeWorker(
		(_url, options) => new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options),
		() => ({ version: "review-test" }),
	);
	const owner = createKnowledgeRuntime(config, host, {}, (input) =>
		acquireKnowledgeWriterLease(input, join(root, "leases")),
	);
	let revoked = false;
	const capabilities = {
		async call(name: string, input: unknown): Promise<unknown> {
			if (revoked) throw Object.assign(new Error("Permission revoked"), { code: "EPERM" });
			const args = input as { root: string; path: string };
			if (name === "roots.resolve") return { handle: "vault-root" };
			if (name === "files.readText") {
				const note = await readNoteFile(vault, args.path);
				return {
					text: note.text,
					sha256: note.hash,
					bytes: note.bytes,
					version: (await inspectNote(vault, args.path)).stat,
				};
			}
			expect(args.root).toBe("state-root");
			if (name === "state.list")
				return (await readdir(join(state, args.path), { withFileTypes: true })).map((e) => ({
					name: e.name,
					kind: e.isFile() ? "file" : "directory",
				}));
			if (name === "state.readJson") {
				try {
					return {
						kind: "value",
						value: JSON.parse(await readFile(join(state, args.path), "utf8")),
					};
				} catch (e) {
					if ((e as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
					throw e;
				}
			}
			throw new Error(`Unexpected capability ${name}`);
		},
	};
	owner.wiki = createKnowledgeWikiReview(
		host,
		config,
		owner.reviewPolicy,
		owner.ui,
		createBrokerWikiReviewPorts(capabilities, "state-root"),
	);
	const reviews = createKnowledgeReviewModel(owner, false, false);
	const pending = join(state, binding.vaultId, "wiki-review/pending");
	await mkdir(pending, { recursive: true });
	const proposal = (project: string) => {
		const value = {
			id: randomUUID(),
			vaultId: binding.vaultId,
			bindingRevision: binding.revision,
			project,
			path: `Projects/${project}/Wiki/Orchid.md`,
			title: "Orchid",
			rationale: "Method summary",
			createdAt: Date.now(),
			before: null,
			beforeHash: null,
			after: "<!-- pi-agent:managed:start -->\nNew summary\n<!-- pi-agent:managed:end -->",
			afterHash: "",
			status: "pending",
			sources: [
				{
					path: "Library/Methods/orchid.md",
					hash: hash(note),
					startLine: 1,
					endLine: 2,
					excerptHash: hash(note),
					paperDois: [],
				},
			],
			proposalHash: "",
		};
		value.afterHash = hash(value.after);
		value.proposalHash = immutableWikiProposalHash(value);
		return value;
	};
	const a = proposal("alpha"),
		b = proposal("beta");
	await writeFile(join(pending, `${a.id}.json`), JSON.stringify(a));
	await writeFile(join(pending, `${b.id}.json`), JSON.stringify(b));
	try {
		expect(await reviews.reviews({ revision: 1 }, null)).toMatchObject({
			project: null,
			total: 0,
		});
		const list = await reviews.reviews({ revision: 1, limit: 1 }, "alpha");
		expect(list.items.map((i) => i.id)).toEqual([a.id]);
		expect(list.items[0].proposalHash).toBe(a.proposalHash);
		const request = {
			revision: 1,
			id: a.id,
			expectedProposalHash: a.proposalHash,
		};
		const preview = await reviews.previewReview(request, "alpha");
		expect(preview).toMatchObject({
			before: "",
			after: "New summary",
			canApply: true,
			scientificallyVerified: false,
		});
		expect(preview.sources[0]).toMatchObject({
			hash: hash(note),
			currentHash: hash(note),
			changed: false,
			startLine: 1,
			endLine: 2,
		});
		const service = await owner.services.getKnowledgeService(binding);
		const { bindingRevision: _, ...projection } = preview;
		expect(await owner.wiki.previewWikiProposal(service, a.id, "alpha")).toEqual(projection);
		await expect(
			reviews.previewReview({ ...request, id: b.id, expectedProposalHash: b.proposalHash }, "alpha"),
		).rejects.toThrow("different project");
		await expect(
			reviews.previewReview({ ...request, expectedProposalHash: "0".repeat(64) }, "alpha"),
		).rejects.toThrow("changed");
		await writeFile(join(vault, "Library/Methods/orchid.md"), note + "Changed source.\n");
		expect(await reviews.previewReview(request, "alpha")).toMatchObject({
			canApply: false,
			sources: [{ changed: true }],
		});
		const corrupt = randomUUID();
		await writeFile(join(pending, `${corrupt}.json`), "{");
		expect((await reviews.reviews({ revision: 1 }, "alpha")).problems).toEqual([
			{ id: corrupt, error: "Wiki proposal JSON is corrupt" },
		]);
		const reviewed = join(state, binding.vaultId, "wiki-review/reviewed");
		await mkdir(reviewed);
		await writeFile(join(reviewed, `${a.id}.json`), JSON.stringify(a));
		await writeFile(join(pending, `${a.id}.json`), "null");
		await expect(reviews.previewReview(request, "alpha")).rejects.toThrow("Invalid Wiki proposal document");
		revoked = true;
		await expect(reviews.reviews({ revision: 1 }, "alpha")).rejects.toThrow("Permission revoked");
	} finally {
		await owner.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
