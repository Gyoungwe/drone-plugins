import type {
	PluginRuntimeCapabilities,
	PluginRuntimeFactoryContext,
	PluginRuntimeRootDescription,
} from "@gyoungwe/plugin-api/runtime";
import type { InquiryLedgerOwner } from "./ledger-owner.js";
import { validateArtifactLineage } from "./lineage.js";
import type {
	ArtifactProvenance,
	ArtifactRecord,
	ArtifactRerunRecord,
	ArtifactRerunResult,
} from "./models.js";
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
	readonly hostRerunCapability?: boolean;
}

type RerunAction = Extract<WriteInput, { action: "rerunArtifact" | "collectRerun" }>;
const inFlight = new WeakMap<InquiryLedgerOwner, ArtifactRerunRecord>();

export function isRerunAction(input: WriteInput): input is RerunAction {
	return input.action === "rerunArtifact" || input.action === "collectRerun";
}

export function executorFor(
	input: WriteInput,
	executor: RerunExecutorPort | undefined,
	hostRerunCapability = false,
	hostRerunUnavailable = false,
) {
	if (!isRerunAction(input)) return;
	if (executor) return executor;
	if (input.action === "collectRerun" || !hostRerunCapability || hostRerunUnavailable)
		throw new Error("Native Inquiry capability is unavailable: rerun-executor");
}

function validHostResult(value: unknown, provenance: ArtifactProvenance): value is ArtifactRerunResult {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const result = value as Record<string, unknown>;
	const keys = new Set(
		"status jobId previousArtifactId previousSha256 artifactId sha256 difference error".split(" "),
	);
	if (Object.keys(result).some((key) => !keys.has(key))) return false;
	if (
		!(["submitted", "running", "reproduced", "superseded", "failed"] as const).includes(
			result.status as ArtifactRerunResult["status"],
		) ||
		typeof result.jobId !== "string" ||
		!result.jobId.trim() ||
		result.previousArtifactId !== provenance.artifact.id ||
		result.previousSha256 !== provenance.artifact.sha256
	)
		return false;
	for (const key of ["artifactId", "sha256", "difference", "error"])
		if (Object.hasOwn(result, key) && typeof result[key] !== "string") return false;
	return true;
}

function notRegistered(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return [
		"Plugin capability is not registered: inquiry.rerun",
		"Fixture capability unavailable: inquiry.rerun",
		"Native Inquiry capability is unavailable: inquiry.rerun",
	].includes(message);
}

async function hostPreflight(owner: InquiryLedgerOwner, artifactId: string) {
	return owner.read(async (service) => {
		const provenance = await service.artifactProvenance(artifactId);
		if (!provenance) throw new Error(`Artifact not found: ${artifactId}`);
		if (provenance.reproducibility !== "reproducible") throw new Error("Artifact is not reproducible");
		const existing = [...(await service.storage.reruns.list())]
			.filter((item) => item.sourceArtifactId === provenance.artifact.id)
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
		return { provenance, existing };
	});
}

export async function requestHostRerun(
	owner: InquiryLedgerOwner,
	artifactId: string,
	capabilities: PluginRuntimeCapabilities,
	signal: AbortSignal,
	onUnavailable: () => void,
): Promise<ArtifactRerunResult> {
	const preflight = await hostPreflight(owner, artifactId);
	if (preflight.existing?.status === "submitted" || preflight.existing?.status === "running")
		return rerunResult(preflight.existing);
	let raw: unknown;
	try {
		raw = await capabilities.call(
			"inquiry.rerun",
			{ artifactId: preflight.provenance.artifact.id, provenance: preflight.provenance },
			signal,
		);
	} catch (error) {
		if (notRegistered(error)) {
			onUnavailable();
			throw new Error("Native Inquiry capability is unavailable: rerun-executor");
		}
		throw error;
	}
	if (!validHostResult(raw, preflight.provenance))
		throw new Error("Host returned an invalid ArtifactRerunResult");
	return owner.write(
		"rerunArtifact",
		async (service) => {
			const result = raw;
			const now = new Date().toISOString();
			const rerun: ArtifactRerunRecord = {
				id: `rerun:${preflight.provenance.artifact.id}:${result.jobId}`,
				schemaVersion: 2,
				projectId: service.storage.projectId,
				sourceArtifactId: preflight.provenance.artifact.id,
				artifact: preflight.provenance.artifact,
				jobId: result.jobId,
				status: result.status,
				previousSha256: preflight.provenance.artifact.sha256,
				...(result.artifactId !== undefined ? { resultArtifactId: result.artifactId } : {}),
				...(result.sha256 !== undefined ? { sha256: result.sha256 } : {}),
				...(result.difference !== undefined ? { difference: result.difference } : {}),
				...(result.error !== undefined ? { error: result.error } : {}),
				submittedAt: now,
				updatedAt: now,
			};
			await service.storage.reruns.put(rerun);
			if (result.status === "superseded" && preflight.provenance.artifact.status !== "superseded")
				await service.storage.artifacts.put({
					...preflight.provenance.artifact,
					status: "superseded",
					updatedAt: now,
				});
			return result;
		},
		signal,
	);
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
