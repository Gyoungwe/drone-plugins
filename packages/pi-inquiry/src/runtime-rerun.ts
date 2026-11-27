import type { PluginRuntimeFactoryContext, PluginRuntimeRootDescription } from "@gyoungwe/plugin-api/runtime";
import type { InquiryLedgerOwner } from "./ledger-owner.js";
import { validateArtifactLineage } from "./lineage.js";
import type { ArtifactProvenance, ArtifactRecord, ArtifactRerunRecord } from "./models.js";
import { rerunResult } from "./rerun-result.js";
import type { WriteInput } from "./runtime-schema.js";
import type { InquiryService } from "./service.js";

export interface RerunExecutorPort {
	submit(provenance: ArtifactProvenance, signal: AbortSignal): Promise<{ readonly jobId: string }>;
	collect(
		rerun: ArtifactRerunRecord,
		signal: AbortSignal,
	): Promise<{ readonly artifact: ArtifactRecord } | { readonly error: string }>;
}

export interface InquiryRuntimeContext extends PluginRuntimeFactoryContext {
	readonly rerunExecutor?: RerunExecutorPort;
}

type RerunAction = Extract<WriteInput, { action: "rerunArtifact" | "collectRerun" }>;
const inFlight = new WeakMap<InquiryLedgerOwner, ArtifactRerunRecord>();

export function isRerunAction(input: WriteInput): input is RerunAction {
	return input.action === "rerunArtifact" || input.action === "collectRerun";
}

export function executorFor(input: WriteInput, executor: RerunExecutorPort | undefined) {
	if (!isRerunAction(input)) return;
	if (!executor) throw new Error("Native Inquiry capability is unavailable: rerun-executor");
	return executor;
}

export function activeRerun(
	input: WriteInput,
	bound: { owner: InquiryLedgerOwner; root: string; metadataRoot: string } | undefined,
	roots: readonly PluginRuntimeRootDescription[],
) {
	if (input.action !== "collectRerun" || !bound) return;
	const rerun = inFlight.get(bound.owner);
	if (rerun?.id !== input.id) return;
	if (
		roots.some((root) => root.kind === "binary-state" && root.handle === bound.root) &&
		roots.some((root) => root.kind === "state" && root.handle === bound.metadataRoot)
	)
		return rerunResult(rerun);
}

function submitRerun(
	owner: InquiryLedgerOwner,
	id: string,
	executor: RerunExecutorPort,
	signal: AbortSignal,
) {
	return owner.write(
		"rerunArtifact",
		(service) => {
			service.setRerunHandler((provenance) => executor.submit(provenance, signal));
			return service.rerunArtifact(id);
		},
		signal,
	);
}

function failedCollection(error: unknown): { readonly error: string } {
	return { error: (error instanceof Error ? error.message : String(error)) || "Rerun collection failed" };
}

async function collectOutcome(
	service: InquiryService,
	rerun: ArtifactRerunRecord,
	executor: RerunExecutorPort,
	signal: AbortSignal,
): ReturnType<RerunExecutorPort["collect"]> {
	let outcome: Awaited<ReturnType<RerunExecutorPort["collect"]>>;
	try {
		outcome = await executor.collect(rerun, signal);
	} catch (error) {
		return failedCollection(error);
	}
	if ("error" in outcome) return failedCollection(outcome.error);
	const { artifact } = outcome;
	if (typeof artifact?.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(artifact.sha256))
		return { error: "Rerun artifact is missing a SHA-256 digest" };
	if (artifact.projectId !== service.storage.projectId)
		return { error: "Rerun artifact belongs to another project" };
	const { artifacts } = await service.snapshot();
	try {
		const errors = validateArtifactLineage(artifact, artifacts);
		return errors.length ? { error: `Invalid artifact record: ${errors.join("; ")}` } : outcome;
	} catch (error) {
		return failedCollection(error);
	}
}

export async function writeRerun(
	owner: InquiryLedgerOwner,
	input: RerunAction,
	executor: RerunExecutorPort,
	signal: AbortSignal,
) {
	if (input.action === "rerunArtifact") return submitRerun(owner, input.id, executor, signal);
	try {
		return await owner.write(
			"collectRerun",
			async (service) => {
				const rerun = await service.markRerunRunning(input.id);
				if (!rerun) throw new Error(`Artifact rerun not found: ${input.id}`);
				if (rerun.status !== "running") return rerunResult(rerun);
				inFlight.set(owner, rerun);
				const outcome = await collectOutcome(service, rerun, executor, signal);
				const result = await service.completeRerun(rerun.id, outcome);
				if (!result) throw new Error(`Artifact rerun not found: ${rerun.id}`);
				return result;
			},
			signal,
		);
	} finally {
		inFlight.delete(owner);
	}
}
