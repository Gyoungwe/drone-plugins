import { effectiveAcceptance } from "./acceptance.js";
import type { TaskFileInspection } from "./file-inspection.js";
import { clean, depsDone, type InspectFile, type TaskMilestone, type TaskRecord } from "./workbench-state.js";
import type { VerifierLookup } from "./workbench-verifiers.js";

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;

async function verifyMilestones(
	task: TaskRecord,
	cwd: string,
	verifierFor: VerifierLookup,
	stillCurrent: () => void,
	now: () => string,
) {
	for (const milestone of task.milestones) {
		const verifier = verifierFor(milestone.acceptance.kind);
		if (!verifier?.verify) continue;
		let result: { state: string; reason?: string };
		try {
			result = ((await verifier.verify(effectiveAcceptance(milestone), {
				cwd,
				task: structuredClone(task),
			})) as typeof result) || { state: "unknown" };
		} catch (error) {
			result = { state: "unknown", reason: clean((error as Error | null)?.message || "verifier-failed") };
		}
		stillCurrent();
		milestone.state =
			result.state === "found" && depsDone(task, milestone)
				? "completed"
				: result.state === "pending"
					? "pending"
					: "blocked";
		milestone.evidence = { ...result, kind: verifier.evidenceKind, at: now() };
		if (result.state === "found")
			for (const operation of task.operations) {
				if (
					operation.identityMilestoneId !== milestone.id ||
					!["returned", "unknown"].includes(operation.state)
				)
					continue;
				operation.state = "verified";
				operation.verifier = verifier.operationVerifier;
				operation.checkedAt = now();
			}
	}
}

async function reconcileFiles(
	task: TaskRecord,
	cwd: string,
	inspect: InspectFile,
	stillCurrent: () => void,
	now: () => string,
) {
	const updates: { milestone: TaskMilestone; artifact?: TaskFileInspection; error?: string }[] = [];
	for (const milestone of task.milestones) {
		if (milestone.acceptance.kind !== "file") continue;
		try {
			const artifact = await inspect(
				cwd,
				(milestone.evidence?.absolutePath || milestone.acceptance.path) as string,
				{
					sha256: milestone.acceptance.sha256 || milestone.evidence?.sha256,
					rootKind: milestone.acceptance.rootKind || milestone.evidence?.rootKind,
				},
			);
			updates.push({ milestone, artifact });
		} catch (error) {
			updates.push({ milestone, error: errorCode(error) || "file-unavailable" });
		}
	}
	stillCurrent();
	for (const { milestone, artifact, error } of updates) {
		if (error) {
			milestone.state = "blocked";
			milestone.evidence = { code: error, at: now() };
		} else if (depsDone(task, milestone)) {
			milestone.state = "completed";
			milestone.evidence = { ...artifact, kind: "file-observed", at: now() };
		}
	}
	for (const operation of task.operations) {
		const { artifact, state } = operation;
		if (!artifact || !["verified", "returned", "unknown"].includes(state)) continue;
		try {
			const observed = await inspect(cwd, artifact.absolutePath || artifact.path, {
				sha256: artifact.sha256,
				rootKind: artifact.rootKind,
			});
			operation.state = "verified";
			operation.checkedAt = now();
			operation.artifact = observed;
		} catch (error) {
			operation.state = errorCode(error) === "ENOENT" ? "not-found" : "changed";
			operation.checkedAt = now();
		}
	}
}

async function reconcileReviews(
	task: TaskRecord,
	cwd: string,
	verifierFor: VerifierLookup,
	stillCurrent: () => void,
	now: () => string,
) {
	for (const operation of task.operations.filter(
		(candidate) => candidate.state === "awaiting-review" && candidate.review?.id,
	)) {
		const review = operation.review;
		const verifier = verifierFor(review?.kind);
		if (!review || !verifier?.resolve) continue;
		let result: { status?: string; stale?: boolean; path?: string; reason?: string } | null;
		try {
			result = (await verifier.resolve(review, { cwd })) as typeof result;
		} catch {
			result = null;
		}
		stillCurrent();
		if (!result) continue;
		operation.checkedAt = now();
		if (result.status === "applied" && !result.stale) {
			operation.state = "verified";
			operation.verifier = verifier.operationVerifier;
			for (const milestone of task.milestones)
				if (
					milestone.acceptance.kind === review.kind &&
					(!milestone.acceptance.path || !result.path || milestone.acceptance.path === result.path) &&
					depsDone(task, milestone)
				) {
					milestone.state = "completed";
					milestone.evidence = { kind: verifier.evidenceKind, candidateId: review.id, at: now() };
				}
		} else if (result.status === "rejected" || result.stale) {
			operation.state = "failed";
			task.reason = result.reason || `${review.kind.replaceAll("_", "-")}-rejected-or-stale`;
		}
	}
}

export async function reconcileTask(
	task: TaskRecord,
	cwd: string,
	inspect: InspectFile,
	verifierFor: VerifierLookup,
	stillCurrent: () => void,
	now: () => string,
) {
	await verifyMilestones(task, cwd, verifierFor, stillCurrent, now);
	await reconcileFiles(task, cwd, inspect, stillCurrent, now);
	stillCurrent();
	await reconcileReviews(task, cwd, verifierFor, stillCurrent, now);
	task.lastReconciledAt = now();
}
