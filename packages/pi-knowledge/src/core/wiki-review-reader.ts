// @ts-nocheck
import { createHash } from "node:crypto";
import { validateNote, canRead } from "./files.js";
import {
	immutableWikiProposalHash as immutableHash,
	targetWikiPath as targetPath,
	managedParts,
} from "./wiki-policy.js";
export { targetWikiPath as targetPath, managedParts } from "./wiki-policy.js";
const MAX_PENDING = 100,
	MAX_AGE = 24 * 60 * 60 * 1000;
const digest = (text) => createHash("sha256").update(text).digest("hex");
/** Storage is scoped by the caller; returned proposals remain untrusted persisted content. */
export function createWikiReviewReader(
	storage: {
		read(path: string): Promise<any | undefined>;
		list(path: string): Promise<string[]>;
	},
	currentNote: (service: any, path: string) => Promise<{ hash: string } | null>,
) {
	async function loadProposal(service, id, project) {
		if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id))
			throw new Error("Invalid Wiki proposal id");
		const base = `${service.binding.vaultId}/wiki-review`;
		const pending = await storage.read(`${base}/pending/${id}.json`);
		const p =
			pending === undefined
				? await storage.read(`${base}/reviewed/${id}.json`)
				: pending;
		if (p === undefined) throw new Error("Wiki proposal does not exist");
		if (!p || typeof p !== "object" || Array.isArray(p))
			throw new Error("Invalid Wiki proposal document");
		if (
			p.id !== id ||
			p.project !== project ||
			p.vaultId !== service.binding.vaultId ||
			p.bindingRevision !== service.binding.revision
		)
			throw new Error("Proposal belongs to a different project or binding");
		targetPath(p.path, project);
		if (
			immutableHash(p) !== p.proposalHash ||
			digest(p.after) !== p.afterHash ||
			(p.before === null
				? p.beforeHash !== null
				: digest(p.before) !== p.beforeHash)
		)
			throw new Error("Wiki proposal content changed");
		return p;
	}
	async function previewWikiProposal(service, id, project) {
		const p = await loadProposal(service, id, project);
		const now = Date.now(),
			target = await currentNote(service, p.path);
		const sources = [];
		for (const source of p.sources) {
			validateNote(source.path);
			if (!canRead(source.path, project))
				throw new Error("Proposal source is outside the current project");
			const current = await currentNote(service, source.path);
			sources.push({
				...source,
				currentHash: current?.hash || null,
				changed: !current || current.hash !== source.hash,
				error: null,
			});
		}
		const expired = now > p.createdAt + MAX_AGE,
			targetChanged = (target?.hash ?? null) !== p.beforeHash;
		const protectedText =
			p.before === null
				? ""
				: p.before.replace(
						/<!-- pi-agent:managed:start -->[\s\S]*?<!-- pi-agent:managed:end -->/,
						"（此处为智能体托管区）",
					);
		return {
			id: p.id,
			path: p.path,
			project,
			status: p.status,
			proposalHash: p.proposalHash,
			title: p.title,
			rationale: p.rationale,
			before: managedParts(p.before || "").body,
			after: managedParts(p.after).body,
			sources,
			protectedText,
			expired,
			targetChanged,
			canApply:
				p.status === "pending" &&
				!expired &&
				!targetChanged &&
				!sources.some((s) => s.changed),
			expiresAt: p.createdAt + MAX_AGE,
			scientificallyVerified: false as const,
		};
	}
	async function listWikiProposals(service, project) {
		let names;
		try {
			names = await storage.list(
				`${service.binding.vaultId}/wiki-review/pending`,
			);
		} catch (error) {
			if (error.code === "ENOENT") return { items: [], problems: [] };
			throw error;
		}
		const items = [],
			problems = [];
		for (const name of names
			.filter((name) => /^[0-9a-f-]{36}\.json$/.test(name))
			.sort()
			.slice(0, MAX_PENDING)) {
			let p;
			try {
				p = await storage.read(
					`${service.binding.vaultId}/wiki-review/pending/${name}`,
				);
			} catch (error) {
				// Only corrupt persisted JSON becomes a row diagnostic; revoked authority fails the read.
				if (!(error instanceof SyntaxError) && error.code !== "ESTATECORRUPTED")
					throw error;
				problems.push({
					id: name.slice(0, -5),
					error: "Wiki proposal JSON is corrupt",
				});
				continue;
			}
			try {
				if (p === undefined)
					throw new Error("Wiki proposal disappeared; refresh the list");
				if (!p || typeof p !== "object" || Array.isArray(p))
					throw new Error("Invalid Wiki proposal document");
				if (p.status === "rejected" || p.status === "applied") continue;
				if (p.project !== project) continue;
				if (p.vaultId !== service.binding.vaultId || p.id !== name.slice(0, -5))
					throw new Error(
						"Proposal belongs to a different binding or filename",
					);
				targetPath(p.path, project);
				if (immutableHash(p) !== p.proposalHash)
					throw new Error("Wiki proposal content changed");
				items.push({
					id: p.id,
					path: p.path,
					title: p.title,
					proposalHash: p.proposalHash,
					status: p.status,
					expiresAt: p.createdAt + MAX_AGE,
					expired: Date.now() > p.createdAt + MAX_AGE,
					bindingChanged: p.bindingRevision !== service.binding.revision,
				});
			} catch (error) {
				problems.push({ id: name.slice(0, -5), error: error.message });
			}
		}
		return { items, problems };
	}

	return { loadProposal, previewWikiProposal, listWikiProposals };
}
