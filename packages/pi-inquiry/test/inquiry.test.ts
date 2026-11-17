import { describe, expect, it } from "vitest";
import {
	decisionRecord,
	type FindingRecord,
	InquiryService,
	MemoryInquiryStorage,
	reproducibilityStatus,
	validateArtifactLineage,
	validateArtifactRecord,
} from "../src/index.js";
import { artifact } from "./helpers/inquiry-fixtures.js";

describe("inquiry ledger records", () => {
	it("classifies the three reproducibility states without side effects", () => {
		expect(reproducibilityStatus("code-1", { workflow: "rnaseq" })).toBe("reproducible");
		expect(reproducibilityStatus("code-1", undefined)).toBe("partial");
		expect(reproducibilityStatus(undefined, { workflow: "rnaseq" })).toBe("partial");
		expect(reproducibilityStatus(undefined, undefined)).toBe("not-reproducible");
		expect(reproducibilityStatus("", {})).toBe("not-reproducible");
		expect(reproducibilityStatus("code-1", {})).toBe("partial");
	});

	it("returns bounded parent provenance and truncates deep lineage", async () => {
		const storage = new MemoryInquiryStorage("project-1");
		const service = new InquiryService(storage);
		for (let index = 0; index <= 22; index += 1) {
			await service.recordArtifact(
				artifact({
					id: `artifact-${index}`,
					parentIds: index === 0 ? [] : [`artifact-${index - 1}`],
					path: `runs/task-1/run-1/output-${index}.tsv`,
				}),
			);
		}
		const provenance = await service.artifactProvenance("artifact-22");
		expect(provenance?.parentChain).toHaveLength(20);
		expect(provenance?.parentChain[0]?.id).toBe("artifact-21");
		expect(provenance?.parentChain.at(-1)?.id).toBe("artifact-2");
		expect(provenance?.parentChainTruncated).toBe(true);
	});

	it("reruns reproducible artifacts and supersedes a changed result", async () => {
		const storage = new MemoryInquiryStorage("project-1");
		const service = new InquiryService(storage);
		await service.recordArtifact(
			artifact({ id: "source", runProvenance: { workflow: "rnaseq" }, sessionId: "s1", turn: 2 }),
		);
		await service.recordAttempt({
			id: "attempt-1",
			schemaVersion: 1,
			projectId: "project-1",
			hypothesisIds: [],
			codeFingerprint: "code-1",
			parameters: { hostId: "local" },
			artifactIds: ["source"],
			outcome: "succeeded",
			enteredReport: false,
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		service.setRerunHandler(async (provenance) => ({
			...provenance.artifact,
			id: "rerun-1",
			sha256: "b".repeat(64),
			parentIds: [provenance.artifact.id],
			createdAt: "2026-01-02T00:00:00.000Z",
			updatedAt: "2026-01-02T00:00:00.000Z",
		}));
		const result = await service.rerunArtifact("source");
		expect(result).toMatchObject({ status: "superseded", artifactId: "rerun-1" });
		expect((await storage.artifacts.get("source"))?.status).toBe("superseded");
		expect((await storage.artifacts.get("rerun-1"))?.sha256).toBe("b".repeat(64));
	});

	it("marks a matching rerun as reproduced without superseding the original", async () => {
		const storage = new MemoryInquiryStorage("project-1");
		const service = new InquiryService(storage);
		await service.recordArtifact(artifact({ id: "same", runProvenance: { workflow: "rnaseq" } }));
		await service.recordAttempt({
			id: "attempt-same",
			schemaVersion: 1,
			projectId: "project-1",
			hypothesisIds: [],
			codeFingerprint: "code-1",
			parameters: {},
			artifactIds: ["same"],
			outcome: "succeeded",
			enteredReport: false,
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		service.setRerunHandler(async (provenance) => ({ ...provenance.artifact, id: "same-rerun" }));
		expect(await service.rerunArtifact("same")).toMatchObject({
			status: "reproduced",
			artifactId: "same-rerun",
		});
		expect((await storage.artifacts.get("same"))?.status).toBe("valid");
	});
	it("submits reruns immediately, persists pending state, and completes asynchronously", async () => {
		const storage = new MemoryInquiryStorage("project-1");
		const service = new InquiryService(storage);
		await service.recordArtifact(artifact({ id: "async", runProvenance: { workflow: "rnaseq" } }));
		await service.recordAttempt({
			id: "attempt-async",
			schemaVersion: 1,
			projectId: "project-1",
			hypothesisIds: [],
			codeFingerprint: "code-1",
			parameters: {},
			artifactIds: ["async"],
			outcome: "succeeded",
			enteredReport: false,
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		service.setRerunHandler(async () => ({ jobId: "job-async" }));
		const result = await service.rerunArtifact("async");
		expect(result).toMatchObject({ status: "submitted", jobId: "job-async" });
		expect(await service.pendingReruns()).toHaveLength(1);
		await service.markRerunRunning("rerun:async:job-async");
		const completed = await service.completeRerun("rerun:async:job-async", {
			artifact: artifact({ id: "async-result", sha256: "b".repeat(64), parentIds: ["async"] }),
		});
		expect(completed).toMatchObject({ status: "superseded", artifactId: "async-result" });
		expect((await storage.artifacts.get("async"))?.status).toBe("superseded");
	});
	it("marks a failed rerun without entering a new artifact", async () => {
		const storage = new MemoryInquiryStorage("project-1");
		const service = new InquiryService(storage);
		await service.recordArtifact(artifact({ id: "failed", runProvenance: { workflow: "rnaseq" } }));
		await service.recordAttempt({
			id: "attempt-failed",
			schemaVersion: 1,
			projectId: "project-1",
			hypothesisIds: [],
			codeFingerprint: "code-1",
			parameters: {},
			artifactIds: ["failed"],
			outcome: "succeeded",
			enteredReport: false,
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		service.setRerunHandler(async () => ({ jobId: "job-failed" }));
		await expect(service.rerunArtifact("failed")).resolves.toMatchObject({ status: "submitted" });
		await service.completeRerun("rerun:failed:job-failed", { error: "runner failed" });
		expect((await storage.snapshot()).artifacts).toHaveLength(1);
		expect((await service.artifactProvenance("failed"))?.rerun).toMatchObject({ status: "failed" });
	});
	it("gets source session and turn from an associated attempt when absent on the artifact", async () => {
		const service = new InquiryService(new MemoryInquiryStorage("project-1"));
		await service.recordArtifact(artifact());
		await service.recordAttempt({
			id: "attempt-source",
			schemaVersion: 1,
			projectId: "project-1",
			hypothesisIds: [],
			parameters: {},
			artifactIds: ["artifact-1"],
			sessionId: "source-session",
			turn: 3,
			outcome: "succeeded",
			enteredReport: false,
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		expect(await service.artifactProvenance("artifact-1")).toMatchObject({
			sourceSessionId: "source-session",
			sourceTurn: 3,
		});
	});
	it("rejects traversal, invalid checksums and incomplete lineage", () => {
		expect(validateArtifactRecord(artifact({ path: "../secret", sha256: "bad" }))).toEqual([
			"path must be a safe project-relative path",
			"sha256 must be a 64-character hexadecimal digest",
		]);
		expect(
			validateArtifactRecord(
				artifact({
					reviews: [{ decisionId: "", confirmedBy: "user", confirmedAt: "bad", reason: "" }],
				}),
			),
		).toContain("artifact reviews must be user confirmations with valid timestamps");
		expect(validateArtifactLineage(artifact({ parentIds: ["missing"] }), [])).toContain(
			"missing parent artifact: missing",
		);
	});

	it("enforces artifact references and produces a read-only cleanup dry-run", async () => {
		const storage = new MemoryInquiryStorage("project-1");
		const service = new InquiryService(storage);
		await service.recordArtifact(artifact());
		const finding: FindingRecord = {
			id: "finding-1",
			schemaVersion: 1,
			projectId: "project-1",
			statement: "The output was generated",
			values: [],
			conditions: [],
			artifactIds: ["artifact-1"],
			label: "confirmatory",
			robustness: { attemptCount: 1, consistentCount: 1, grade: "robust" },
			hypothesisIds: [],
			reviewStatus: "unreviewed",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
		await service.recordFinding(finding);
		await service.recordArtifact(
			artifact({
				id: "draft-1",
				path: "runs/task-1/run-1/tmp.txt",
				purpose: "draft",
				updatedAt: "2025-01-01T00:00:00.000Z",
			}),
		);
		const dryRun = await service.cleanupDryRun({ staleBefore: "2026-01-01T00:00:00.000Z" });
		expect(dryRun.destructive).toBe(false);
		expect(dryRun.candidates.map((candidate) => candidate.artifact.id)).toEqual(["draft-1"]);
	});

	it("records every decision kind and revokes two downstream lineage levels", async () => {
		const storage = new MemoryInquiryStorage("project-1");
		const service = new InquiryService(storage);
		await service.recordArtifact(artifact({ id: "root" }));
		await service.recordArtifact(
			artifact({ id: "child", parentIds: ["root"], path: "runs/task-1/run-1/child.tsv" }),
		);
		await service.recordArtifact(
			artifact({ id: "grandchild", parentIds: ["child"], path: "runs/task-1/run-1/grandchild.tsv" }),
		);
		const kinds = [
			"task-authorization",
			"workflow-repair",
			"subagent-dispatch",
			"compute-submit",
			"zotero-write",
			"rebind",
		] as const;
		for (const kind of kinds)
			await service.recordDecision(
				decisionRecord({
					id: `decision-${kind}`,
					projectId: "project-1",
					kind,
					summary: `Recorded ${kind}`,
					basis: [`basis-${kind}`],
					affectedArtifactIds: kind === "task-authorization" ? ["root"] : [],
				}),
			);
		expect((await service.listDecisions()).map((item) => item.kind)).toHaveLength(kinds.length);
		const revoked = await service.revokeDecision("decision-task-authorization", "Needs human review");
		expect(revoked.status).toBe("revoked");
		const statuses = (await storage.snapshot()).artifacts.map((item) => item.status);
		expect(statuses).toEqual(["pending-review", "pending-review", "pending-review"]);
	});

	it("confirms revoked artifacts as user-reviewed and records the confirmation", async () => {
		const storage = new MemoryInquiryStorage("project-1");
		const service = new InquiryService(storage);
		await service.recordArtifact(artifact({ id: "review-root" }));
		await service.recordArtifact(
			artifact({
				id: "review-child",
				parentIds: ["review-root"],
				path: "runs/task-1/run-1/review-child.tsv",
			}),
		);
		await service.recordDecision(
			decisionRecord({
				id: "decision-review",
				projectId: "project-1",
				kind: "workflow-repair",
				summary: "Repair changed the workflow",
				affectedArtifactIds: ["review-root"],
			}),
		);
		await service.revokeDecision("decision-review", "Please inspect");
		const confirmed = await service.reviewDecisionArtifacts("decision-review", "I checked the outputs");
		expect(confirmed.status).toBe("revoked");
		const snapshot = await storage.snapshot();
		expect(snapshot.artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "review-root",
					status: "valid",
					pendingReviewDecisionIds: [],
					reviews: [
						{
							decisionId: "decision-review",
							confirmedBy: "user",
							confirmedAt: expect.any(String),
							reason: "I checked the outputs",
						},
					],
				}),
				expect.objectContaining({ id: "review-child", status: "valid", pendingReviewDecisionIds: [] }),
			]),
		);
	});
});
