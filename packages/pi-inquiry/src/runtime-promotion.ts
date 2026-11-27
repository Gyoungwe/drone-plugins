import { createHash } from "node:crypto";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import type { PluginRuntimeCapabilities, PluginRuntimeRootDescription } from "@gyoungwe/plugin-api/runtime";
import type { InquiryLedgerOwner } from "./ledger-owner.js";
import type { ReadInput, WriteInput } from "./runtime-schema.js";
import type { InquiryService } from "./service.js";
import {
	type WorkspaceEntry,
	type WorkspaceFilePort,
	type WorkspaceLayout,
	type WorkspacePromotionPlan,
	workspaceLayout,
} from "./workspace.js";

type PlanInput = Extract<ReadInput, { action: "planPromotion" }>;
type PromoteInput = Extract<WriteInput, { action: "promoteRun" }>;
type FileVersion = {
	readonly dev: number;
	readonly ino: number;
	readonly size: number;
	readonly mtimeMs: number;
	readonly ctimeMs: number;
};
type FileStat = { readonly kind: "file" | "directory" | "symlink" | "other"; readonly version: FileVersion };
type TextRead = { readonly text: string; readonly sha256: string };
type IndexWrite = { readonly written: true; readonly sha256: string };
type PromotionRoot = PluginRuntimeRootDescription;
type PromotionPlan = {
	readonly layout: WorkspaceLayout;
	readonly executionPlan: WorkspacePromotionPlan;
	readonly plan: WorkspacePromotionPlan;
	readonly planSha256: string;
};

const rootError = "Inquiry promotion requires a granted read-write files root";
const terminalError = "Inquiry promotion requires a terminal task run";
const changedError = "Inquiry promotion plan changed; review it again";
const indexError = "Inquiry results index is not a WorkspaceEntry array";
const readbackError = "Inquiry results index did not read back";

export function selectPromotionRoot(
	roots: readonly PluginRuntimeRootDescription[],
	handle?: string,
): PromotionRoot {
	const root = roots.find(
		(item) =>
			item.kind === "files" &&
			item.access === "read-write" &&
			(handle === undefined || item.handle === handle),
	);
	if (!root) throw new Error(rootError);
	return root;
}

function relativePath(root: string, path: string): string {
	const candidate = relative(resolve(root), resolve(path));
	if (!candidate || isAbsolute(candidate) || candidate.startsWith(".."))
		throw new Error("Inquiry promotion path escapes the granted files root");
	return candidate.split(sep).join("/");
}

function digest(plan: WorkspacePromotionPlan): string {
	return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

async function planFor(
	service: InquiryService,
	input: PlanInput | PromoteInput,
	root: PromotionRoot,
): Promise<PromotionPlan> {
	const runId = input.runId ?? input.taskId;
	const snapshot = await service.snapshot();
	const attempt = snapshot.attempts.find(
		(item) => item.id === `task:${runId}` && item.parameters.taskId === input.taskId && item.finishedAt,
	);
	if (!attempt?.finishedAt) throw new Error(terminalError);
	const layout = workspaceLayout(root.path);
	const plan = await service.planPromotion({
		layout,
		run: {
			id: runId,
			taskId: input.taskId,
			root: resolve(root.path, "runs", input.taskId, runId),
			state: "frozen",
			createdAt: attempt.startedAt,
			frozenAt: attempt.finishedAt,
		},
	});
	const relativePlan = {
		...plan,
		moves: plan.moves.map((move) => ({
			...move,
			from: relativePath(root.path, move.from),
			to: relativePath(root.path, move.to),
		})),
	};
	return { layout, executionPlan: plan, plan: relativePlan, planSha256: digest(relativePlan) };
}

export async function readPromotionPlan(
	owner: InquiryLedgerOwner,
	roots: readonly PluginRuntimeRootDescription[],
	input: PlanInput,
) {
	const root = selectPromotionRoot(roots, input.root);
	const result = await owner.read((service) => planFor(service, input, root));
	return { plan: result.plan, planSha256: result.planSha256, root: root.handle };
}

async function readExistingIndex(
	capabilities: PluginRuntimeCapabilities,
	root: PromotionRoot,
	signal: AbortSignal,
): Promise<{ readonly entries: readonly WorkspaceEntry[]; readonly expectedHash: string | null }> {
	let existing: TextRead;
	try {
		existing = (await capabilities.call(
			"files.readText",
			{ root: root.handle, path: "results/index.json" },
			signal,
		)) as TextRead;
	} catch (readError) {
		signal.throwIfAborted();
		try {
			await capabilities.call("files.stat", { root: root.handle, path: "results/index.json" }, signal);
		} catch {
			signal.throwIfAborted();
			return { entries: [], expectedHash: null };
		}
		throw readError;
	}
	let entries: unknown;
	try {
		entries = JSON.parse(existing.text);
	} catch {
		throw new Error(indexError);
	}
	if (!Array.isArray(entries)) throw new Error(indexError);
	return { entries: entries as WorkspaceEntry[], expectedHash: existing.sha256 };
}

function mergeEntries(
	existing: readonly WorkspaceEntry[],
	current: readonly WorkspaceEntry[],
): readonly WorkspaceEntry[] {
	const replacing = new Set(current.map((entry) => entry.artifactId));
	const merged = [...existing.filter((entry) => !replacing.has(entry.artifactId)), ...current];
	const paths = new Set<string>();
	for (const entry of merged) {
		if (paths.has(entry.resultPath)) throw new Error("Inquiry results index contains duplicate result paths");
		paths.add(entry.resultPath);
	}
	return merged.sort((left, right) => left.artifactId.localeCompare(right.artifactId));
}

async function writeMergedIndex(
	capabilities: PluginRuntimeCapabilities,
	root: PromotionRoot,
	signal: AbortSignal,
	current: readonly WorkspaceEntry[],
	ensured: Set<string>,
): Promise<string> {
	const existing = await readExistingIndex(capabilities, root, signal);
	const entries = mergeEntries(existing.entries, current);
	await ensureParents(capabilities, root, signal, "results/index.json", ensured);
	const written = (await capabilities.call(
		"files.writeIndex",
		{ root: root.handle, entries, expectedHash: existing.expectedHash },
		signal,
	)) as IndexWrite;
	const readback = (await capabilities.call(
		"files.readText",
		{ root: root.handle, path: "results/index.json" },
		signal,
	)) as TextRead;
	let readEntries: unknown;
	try {
		readEntries = JSON.parse(readback.text);
	} catch {
		throw new Error(readbackError);
	}
	const containsAll =
		Array.isArray(readEntries) &&
		current.every((entry) => readEntries.some((item) => item?.artifactId === entry.artifactId));
	if (readback.sha256 !== written.sha256 || !containsAll) throw new Error(readbackError);
	return written.sha256;
}

async function ensureParents(
	capabilities: PluginRuntimeCapabilities,
	root: PromotionRoot,
	signal: AbortSignal,
	path: string,
	ensured: Set<string>,
): Promise<void> {
	let current = "";
	for (const part of posix.dirname(path).split("/")) {
		if (!part) continue;
		current = current ? `${current}/${part}` : part;
		if (ensured.has(current)) continue;
		await capabilities.call("files.ensureDirectory", { root: root.handle, path: current }, signal);
		ensured.add(current);
	}
}

function createFilesPort(
	capabilities: PluginRuntimeCapabilities,
	root: PromotionRoot,
	layout: WorkspaceLayout,
	signal: AbortSignal,
	state: { indexSha256: string },
): WorkspaceFilePort {
	const ensured = new Set<string>();
	return {
		async move(from, to) {
			const source = relativePath(root.path, from);
			const target = relativePath(root.path, to);
			const stat = (await capabilities.call(
				"files.stat",
				{ root: root.handle, path: source },
				signal,
			)) as FileStat;
			if (stat.kind !== "file") throw new Error(`Inquiry promotion source is not a file: ${source}`);
			await ensureParents(capabilities, root, signal, target, ensured);
			await capabilities.call(
				"files.move",
				{ root: root.handle, from: source, to: target, expectedVersion: stat.version },
				signal,
			);
		},
		async writeIndex(path, entries) {
			if (path !== layout.indexPath)
				throw new Error("Inquiry promotion index path is outside the planned results index");
			state.indexSha256 = await writeMergedIndex(capabilities, root, signal, entries, ensured);
		},
	};
}

function assertReviewed(input: PromoteInput, plan: PromotionPlan): void {
	if (input.planSha256 !== plan.planSha256) throw new Error(changedError);
}

export async function promoteRun(
	owner: InquiryLedgerOwner,
	roots: readonly PluginRuntimeRootDescription[],
	capabilities: PluginRuntimeCapabilities,
	input: PromoteInput,
	signal: AbortSignal,
) {
	const root = selectPromotionRoot(roots, input.root);
	const reviewed = await owner.read((service) => planFor(service, input, root));
	assertReviewed(input, reviewed);
	return owner.write(
		"promoteRun",
		async (service) => {
			const current = await planFor(service, input, root);
			assertReviewed(input, current);
			const state = { indexSha256: "" };
			const result = await service.promote({
				plan: current.executionPlan,
				layout: current.layout,
				files: createFilesPort(capabilities, root, current.layout, signal, state),
			});
			return {
				...result,
				moves: current.plan.moves,
				indexPath: relativePath(root.path, result.indexPath),
				indexSha256: state.indexSha256,
				planSha256: current.planSha256,
			};
		},
		signal,
	);
}
