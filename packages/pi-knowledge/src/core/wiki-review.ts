// @ts-nocheck
import type { KnowledgeConfigApi } from "./config.js";
import * as compatibilityConfig from "./config.js";
import { canRead, validateNote } from "./files.js";
import * as compatibilityReviewPolicy from "./review-policy.js";
import { compatibilityKnowledgeRuntimeHost, type KnowledgeRuntimeHost } from "./runtime-host.js";
import type { createKnowledgeUi } from "./ui-state.js";
import * as compatibilityUi from "./ui-state.js";
import * as wikiPolicy from "./wiki-policy.js";
import * as drafts from "./wiki-review-draft.js";
import { createLocalWikiReviewPorts, renameWithRetry as renameLocalWikiFile } from "./wiki-review-node.js";
import type { WikiReviewPorts } from "./wiki-review-ports.js";
import { createWikiReviewReader } from "./wiki-review-reader.js";

export function createKnowledgeWikiReview(
	runtime: Pick<KnowledgeRuntimeHost, "runRuntimeExclusive">,
	config: Pick<KnowledgeConfigApi, "withKnowledgeBinding">,
	reviewPolicy: Pick<typeof compatibilityReviewPolicy, "readReviewMode">,
	ui: Pick<ReturnType<typeof createKnowledgeUi>, "invalidateKnowledgeUi">,
	io: WikiReviewPorts,
) {
	const { runRuntimeExclusive } = runtime;
	const { withKnowledgeBinding } = config;
	const { readReviewMode } = reviewPolicy;
	const { invalidateKnowledgeUi } = ui;
	const AUTOMATIC_AUTHORITY = Symbol("host-automatic-wiki");
	async function exclusive(key, operation) {
		return runRuntimeExclusive("wiki-review", key, operation);
	}
	function rootFor(service) {
		return `${service.binding.vaultId}/wiki-review`;
	}
	async function atomicJson(path, value) {
		const current = await io.state.read(path);
		await io.state.write(path, value, current?.version ?? null);
	}
	const currentNote = (service, path) => io.files.read(service.binding, path);
	const reader = createWikiReviewReader(
		{ read: async (path) => (await io.state.read(path))?.value, list: (path) => io.state.list(path) },
		currentNote,
	);
	const loadProposal = reader.loadProposal;
	async function stageWikiProposal(service, ticket, cwd, input) {
		drafts.validateWikiSourcePaths(input.source_paths);
		return withKnowledgeBinding(service.binding, async () => {
			if (service.binding.depositMode === "run-only")
				throw new Error("Wiki proposals are disabled by run-only mode");
			const { project, sources } = await service.evidenceReceipts(ticket, cwd, input.source_paths);
			const path = wikiPolicy.targetWikiPath(input.path, project);
			const draft = drafts.readWikiDraft(input, sources, path);
			const original = await currentNote(service, path);
			if (original) await service.evidenceReceipts(ticket, cwd, [path]);
			const proposal = drafts.buildWikiDraft(service.binding, project, path, draft, original, sources);
			if (Buffer.byteLength(JSON.stringify(proposal, null, 2)) + 1 > 256 * 1024)
				throw new Error("Wiki proposal exceeds the bounded review storage size");
			const root = rootFor(service);
			await exclusive(root, async () => {
				const directory = `${root}/pending`;
				let names;
				try {
					names = await io.state.list(directory);
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
					names = [];
				}
				if (names.filter((name) => name.endsWith(".json")).length >= wikiPolicy.MAX_PENDING_WIKI_PROPOSALS)
					throw new Error("Pending Wiki review limit reached; review existing candidates first");
				await atomicJson(`${directory}/${proposal.id}.json`, proposal);
			});
			invalidateKnowledgeUi();
			return {
				id: proposal.id,
				status: "pending",
				path,
				project,
				proposalHash: proposal.proposalHash,
				sources,
				vaultWritten: false,
				scientificallyVerified: false,
				next: "User: run /obsidian-review to review the exact proposed change.",
			};
		});
	}

	// Host-only accumulation for repeated research rounds on the exact same topic.
	// It keeps one pending candidate, revalidates all earlier source versions, and
	// invalidates any stale UI preview by changing the proposal hash.
	/** @param {any} service @param {any} ticket @param {string} cwd @param {string} id @param {Record<string, any>} [input] */
	async function mergeWikiProposal(service, ticket, cwd, id, { markdown, rationale, source_paths } = {}) {
		wikiPolicy.checkWikiProposalId(id);
		return exclusive(`${rootFor(service)}:${id}`, () =>
			withKnowledgeBinding(service.binding, async () => {
				const { project, sources: newSources } = await service.evidenceReceipts(ticket, cwd, source_paths);
				const p = await loadProposal(service, id, project);
				if (p.status !== "pending")
					throw new Error("Only a pending Wiki candidate can accumulate another research round");
				if (Date.now() > p.createdAt + wikiPolicy.WIKI_PROPOSAL_MAX_AGE)
					throw new Error(
						"Pending Wiki candidate expired; review or replace it before accumulating more rounds",
					);
				const target = await currentNote(service, p.path);
				if ((target?.hash ?? null) !== p.beforeHash)
					throw new Error("Wiki changed since the pending candidate was created");
				await verifySources(service, p);
				const updated = drafts.mergeWikiDraft(p, newSources, markdown, rationale);
				if (Buffer.byteLength(JSON.stringify(updated, null, 2)) + 1 > 256 * 1024)
					throw new Error("Merged Wiki proposal exceeds the bounded review storage size");
				await exclusive(rootFor(service), () =>
					atomicJson(`${rootFor(service)}/pending/${p.id}.json`, updated),
				);
				invalidateKnowledgeUi();
				return {
					id: p.id,
					status: "pending",
					path: p.path,
					project,
					proposalHash: updated.proposalHash,
					sources: updated.sources,
					merged: true,
					roundAdded: true,
					vaultWritten: false,
					scientificallyVerified: false,
					next: "User: review the accumulated exact change in Wiki review.",
				};
			}),
		);
	}

	const previewWikiProposal = (service, id, project) =>
		withKnowledgeBinding(service.binding, () => reader.previewWikiProposal(service, id, project));
	const listWikiProposals = (service, project) =>
		withKnowledgeBinding(service.binding, () => reader.listWikiProposals(service, project));
	async function verifySources(service, p) {
		for (const source of p.sources) {
			validateNote(source.path);
			if (!canRead(source.path, p.project)) throw new Error("Source is outside proposal scope");
			const current = await currentNote(service, source.path);
			if (!current || current.hash !== source.hash)
				throw new Error(`Source changed since proposal: ${source.path}`);
		}
	}
	async function finish(service, p, status, review = { actor: "human" }) {
		const updated = {
			...p,
			status,
			reviewedAt: Date.now(),
			reviewMethod: review.actor,
			modelReview: review.actor === "model" ? review : null,
			humanReviewed: review.actor === "human",
			scientificallyVerified: false,
		};
		await atomicJson(`${rootFor(service)}/reviewed/${p.id}.json`, updated);
		const pendingPath = `${rootFor(service)}/pending/${p.id}.json`;
		const pending = await io.state.read(pendingPath);
		if (pending) {
			if (pending.value.proposalHash !== p.proposalHash)
				throw new Error("Wiki proposal changed before recording review");
			await io.state.remove(pendingPath, pending.version);
		}
		invalidateKnowledgeUi();
	}
	// This is a host API. It is deliberately not exposed as a model tool with approved:true.
	// The UI command passes the exact preview hash after a fresh native user choice.
	async function decideWikiProposal(
		service,
		id,
		project,
		expectedHash,
		decision,
		review = { actor: "human" },
	): Promise<any> {
		wikiPolicy.checkWikiProposalId(id);
		if (
			!["human", "model", "automatic"].includes(review.actor) ||
			(review.actor === "automatic" && review.authority !== AUTOMATIC_AUTHORITY) ||
			(review.actor === "model" &&
				(!review.auditId || review.verdict !== "approve" || typeof review.checkCurrent !== "function"))
		)
			throw new Error("Invalid model-review authority");
		return exclusive(`${rootFor(service)}:${id}`, () =>
			withKnowledgeBinding(service.binding, async () => {
				await review.checkCurrent?.();
				const p = await loadProposal(service, id, project);
				if (expectedHash !== p.proposalHash)
					throw new Error("The reviewed candidate changed; preview it again");
				if (p.status !== "pending") return { id, status: p.status, alreadyReviewed: true };
				if (decision === "reject") {
					await finish(service, p, "rejected", review);
					return { id, status: "rejected", vaultWritten: false };
				}
				if (decision !== "apply") throw new Error("Unknown review decision");
				if (service.binding.depositMode === "run-only")
					throw new Error("Wiki writes are disabled by run-only mode");
				if (Date.now() - p.createdAt > wikiPolicy.WIKI_PROPOSAL_MAX_AGE)
					throw new Error("Wiki proposal expired; regenerate it from current evidence");
				return exclusive(`${service.binding.vault}:wiki:${p.path}`, async () => {
					const current = await currentNote(service, p.path);
					const recovered = current?.hash === p.afterHash;
					if (review.actor === "automatic") {
						if ((await readReviewMode()) !== "automatic")
							throw new Error("Strict review requires confirmation");
						if (
							!recovered &&
							current &&
							!(await knownGeneratedPage(service, p.project, p.path, current.hash))
						)
							throw new Error("Existing or human-edited page requires confirmation");
					}
					if (!recovered) {
						if ((current?.hash ?? null) !== p.beforeHash)
							throw new Error("Wiki changed after preview; no user edits were overwritten");
						await verifySources(service, p);
						await io.files.write(service.binding, p.path, p.after, p.beforeHash, async () => {
							await withKnowledgeBinding(service.binding, async () => {});
							await verifySources(service, p);
							await review.checkCurrent?.();
						});
					}
					let reviewRecorded = true,
						recordError = null,
						indexed = true,
						indexError = null;
					try {
						await finish(service, p, "applied", review);
					} catch (error) {
						reviewRecorded = false;
						recordError = error.message;
					}
					try {
						await service.request("changed", { paths: [p.path] });
					} catch (error) {
						indexed = false;
						indexError = error.message;
					}
					return {
						id,
						status: "applied",
						path: p.path,
						vaultWritten: true,
						recovered,
						reviewRecorded,
						recordError,
						indexed,
						indexError,
						scientificallyVerified: false,
						humanReviewed: review.actor === "human",
						reviewMethod: review.actor,
						maintenance: "queued",
					};
				});
			}),
		);
	}

	/**
	 * 自动审核模式下由宿主直接应用候选：新页面或此前由 Agent 生成且未被人工改过的页面直接写入；
	 * 已有人工内容、冲突或严格审核模式则保持 pending，返回原因，交给 Wiki 审核页。
	 * @param {any} service @param {string} id @param {string} project @param {string} expectedHash
	 */
	async function autoApplyWikiProposal(service, id, project, expectedHash) {
		if ((await readReviewMode()) !== "automatic") return { id, status: "pending", reason: "strict-review" };
		try {
			return await decideWikiProposal(service, id, project, expectedHash, "apply", {
				actor: "automatic",
				authority: AUTOMATIC_AUTHORITY,
			});
		} catch (error) {
			return {
				id,
				status: "pending",
				reason: String(error?.message || error).slice(0, 300),
			};
		}
	}

	// History contains exact before/after content; ownership is proven by a prior applied hash,
	// not by a marker a human may have typed into a page.
	async function wikiHistory(service, project) {
		return withKnowledgeBinding(service.binding, async () => {
			let names;
			try {
				names = await io.state.list(`${rootFor(service)}/reviewed`);
			} catch (error) {
				if (error.code === "ENOENT") return [];
				throw error;
			}
			const items = [];
			for (const name of names.filter((n) => /^[0-9a-f-]{36}\.json$/.test(n))) {
				const record = await io.state.read(`${rootFor(service)}/reviewed/${name}`);
				// Other projects share this directory; corrupt records and revoked
				// reads must remain visible rather than becoming an empty history.
				if (record && typeof record.value?.project === "string" && record.value.project !== project) continue;
				const p = await loadProposal(service, name.slice(0, -5), project);
				if (p.status !== "applied") continue;
				items.push({
					id: p.id,
					path: p.path,
					afterHash: p.afterHash,
					reviewedAt: p.reviewedAt,
					reviewMethod: p.reviewMethod,
				});
			}
			return items.sort((a, b) => b.reviewedAt - a.reviewedAt);
		});
	}
	async function knownGeneratedPage(service, project, path, hash) {
		return (await wikiHistory(service, project)).some((p) => p.path === path && p.afterHash === hash);
	}
	// Host UI only; compare-and-swap protects edits made after the saved version.
	async function undoWikiUpdate(
		service,
		project,
		id,
		expectedHash,
	): Promise<{ status: "reverted"; path: string }> {
		wikiPolicy.checkWikiProposalId(id);
		return exclusive(`${rootFor(service)}:${id}`, () =>
			withKnowledgeBinding(service.binding, async () => {
				const p = await loadProposal(service, id, project);
				if (p.status !== "applied" || p.afterHash !== expectedHash)
					throw new Error("Refresh Wiki history before undo");
				return exclusive(`${service.binding.vault}:wiki:${p.path}`, async () => {
					const current = await currentNote(service, p.path);
					if (current?.hash !== p.afterHash)
						throw new Error("Wiki changed since saving; undo would overwrite edits");
					const check = () => withKnowledgeBinding(service.binding, async () => {});
					if (p.before === null) await io.files.remove(service.binding, p.path, p.afterHash, check);
					else await io.files.write(service.binding, p.path, p.before, p.afterHash, check);
					await finish(service, p, "reverted");
					await service.request("changed", { paths: [p.path] });
					return { status: "reverted", path: p.path };
				});
			}),
		);
	}

	return {
		validateWikiSourcePaths: drafts.validateWikiSourcePaths,
		stageWikiProposal,
		mergeWikiProposal,
		previewWikiProposal,
		listWikiProposals,
		decideWikiProposal,
		autoApplyWikiProposal,
		wikiHistory,
		undoWikiUpdate,
		renameWithRetry: renameLocalWikiFile,
	};
}

// pi-knowledge 0.2 compatibility. Remove after all native/Desktop adapters
// use explicit owners and per-session publication instances in 0.3.
const compatibility = createKnowledgeWikiReview(
	compatibilityKnowledgeRuntimeHost,
	compatibilityConfig,
	compatibilityReviewPolicy,
	compatibilityUi,
	createLocalWikiReviewPorts(compatibilityConfig),
);
export const {
	validateWikiSourcePaths,
	stageWikiProposal,
	mergeWikiProposal,
	previewWikiProposal,
	listWikiProposals,
	decideWikiProposal,
	autoApplyWikiProposal,
	wikiHistory,
	undoWikiUpdate,
	renameWithRetry,
} = compatibility;
