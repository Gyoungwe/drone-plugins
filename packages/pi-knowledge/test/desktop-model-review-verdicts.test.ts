import { afterEach, expect, it } from "vitest";
import { immutableWikiProposalHash } from "../src/core/wiki-policy.js";
import {
	binding,
	cleanReview,
	digest,
	reviewPath,
	selection,
	sourcePath,
	verdictFixture,
} from "./helpers/model-review-verdict-fixture.js";

type Fixture = Awaited<ReturnType<typeof verdictFixture>>;
const fixtures: Fixture[] = [];
afterEach(async () => {
	for (const fixture of fixtures.splice(0)) await fixture.dispose();
});

async function fixture(readOnly = false) {
	const owner = await verdictFixture(readOnly);
	fixtures.push(owner);
	return owner;
}

function expectPendingWithoutWrite(f: Fixture) {
	expect(f.files.write).not.toHaveBeenCalled();
	expect(f.files.writeApproval).not.toHaveBeenCalled();
	expect(f.files.notes.has(f.candidate.path)).toBe(false);
	expect(f.state.read(reviewPath("pending", f.candidate.id))).toMatchObject({
		kind: "value",
		value: f.candidate,
	});
	expect(f.state.read(reviewPath("reviewed", f.candidate.id))).toMatchObject({ kind: "missing" });
}

async function expectAdviceAudit(f: Fixture, result: unknown, canAutoApply: boolean) {
	expect(result).toMatchObject({
		proposalId: f.candidate.id,
		proposalHash: f.candidate.proposalHash,
		bindingRevision: binding.revision,
		model: `${selection.provider}/${selection.model}`,
		...f.model.decision,
		canAutoApply,
		autoApplyAuthorized: f.input.autoApply,
		applied: false,
		humanReviewed: false,
		scientificallyVerified: false,
	});
	expect(result).not.toHaveProperty("writeResult");
	expect(await f.info()).toMatchObject({ lastReview: result });
	expect(f.model.generate).toHaveBeenCalledOnce();
	expectPendingWithoutWrite(f);
}

it.each(["reject", "needs-human"] as const)(
	"keeps %s as advice with the candidate pending",
	async (verdict) => {
		const f = await fixture();
		f.model.decision.verdict = verdict;
		await expectAdviceAudit(f, await f.review(), false);
	},
);

it("keeps approve with a caution as advice with the candidate pending", async () => {
	const f = await fixture();
	f.model.decision.cautions.push("The original experiment still needs human assessment.");
	await expectAdviceAudit(f, await f.review(), false);
});

it.each(Object.keys(cleanReview().checks) as (keyof ReturnType<typeof cleanReview>["checks"])[])(
	"keeps approve with failed %s as advice with the candidate pending",
	async (check) => {
		const f = await fixture();
		f.model.decision.checks[check] = false;
		await expectAdviceAudit(f, await f.review(), false);
	},
);

it("records clean approve as advice when autoApply is false", async () => {
	const f = await fixture();
	f.input.autoApply = false;
	await expectAdviceAudit(f, await f.review(), true);
});

it("applies only the exact approved proposal with model provenance and no certification", async () => {
	const f = await fixture();
	const result = await f.review();
	expect(result).toMatchObject({
		proposalId: f.candidate.id,
		proposalHash: f.candidate.proposalHash,
		bindingRevision: binding.revision,
		verdict: "approve",
		model: `${selection.provider}/${selection.model}`,
		applied: true,
		partial: false,
		humanReviewed: false,
		scientificallyVerified: false,
		writeResult: {
			id: f.candidate.id,
			path: f.candidate.path,
			status: "applied",
			vaultWritten: true,
			reviewRecorded: true,
			indexed: true,
			reviewMethod: "model",
			humanReviewed: false,
			scientificallyVerified: false,
		},
	});
	expect(f.files.write).toHaveBeenCalledExactlyOnceWith(f.candidate.path, f.candidate.after);
	expect(digest(f.files.notes.get(f.candidate.path) as string)).toBe(f.candidate.afterHash);
	expect(f.files.writeApproval).toHaveBeenCalledOnce();
	expect(f.model.approve).toHaveBeenCalledOnce();
	expect(f.state.read(reviewPath("pending", f.candidate.id))).toMatchObject({ kind: "missing" });
	const saved = f.state.read(reviewPath("reviewed", f.candidate.id));
	expect(saved).toMatchObject({
		value: {
			...f.candidate,
			status: "applied",
			reviewMethod: "model",
			humanReviewed: false,
			scientificallyVerified: false,
			modelReview: { actor: "model", model: `${selection.provider}/${selection.model}`, verdict: "approve" },
		},
	});
	expect(saved.value.modelReview.auditId).toBe((result as { auditId: string }).auditId);
	expect(await f.info()).toMatchObject({ lastReview: result });
	expect(f.state.read(reviewPath("pending", f.other.id))).toMatchObject({ value: f.other });
	expect(f.files.notes.has(f.other.path)).toBe(false);
});

it("reports write approval denial after model approval and leaves the candidate pending", async () => {
	const f = await fixture();
	f.files.access.writeApproved = false;
	const result = await f.review();
	expect(result).toMatchObject({
		verdict: "approve",
		canAutoApply: true,
		autoApplyAuthorized: true,
		applied: false,
		applyError: "Synthetic Vault write approval denied",
	});
	expect(result).not.toHaveProperty("writeResult");
	expect(await f.info()).toMatchObject({ lastReview: result });
	expect(f.model.approve).toHaveBeenCalledOnce();
	expect(f.model.generate).toHaveBeenCalledOnce();
	expect(f.files.writeApproval).toHaveBeenCalledOnce();
	expect(f.files.write).not.toHaveBeenCalled();
	expect(f.files.notes.has(f.candidate.path)).toBe(false);
	expect(f.state.read(reviewPath("pending", f.candidate.id))).toMatchObject({ value: f.candidate });
	expect(f.state.read(reviewPath("reviewed", f.candidate.id))).toMatchObject({ kind: "missing" });
});

it("does not generate when model approval is denied even with writes permitted", async () => {
	const f = await fixture();
	f.model.approval.allowed = false;
	await expect(f.review()).rejects.toThrow("Synthetic model approval denied");
	expect(f.model.approve).toHaveBeenCalledOnce();
	expect(f.model.generate).not.toHaveBeenCalled();
	expectPendingWithoutWrite(f);
	expect(await f.info()).toMatchObject({ lastReview: null });
});

it.each(["proposal", "source", "target"] as const)(
	"refuses to apply when the %s changes during generation",
	async (changed) => {
		const f = await fixture();
		const generate = f.model.generate.getMockImplementation();
		if (!generate) throw new Error("Expected the synthetic generation implementation");
		f.model.generate.mockImplementationOnce(async (input) => {
			if (changed === "proposal") {
				const candidate = { ...f.candidate, rationale: "Changed while the model was generating" };
				candidate.proposalHash = immutableWikiProposalHash(candidate);
				f.state.documents.set(reviewPath("pending", candidate.id), JSON.stringify(candidate));
			} else f.files.notes.set(changed === "source" ? sourcePath : f.candidate.path, "Changed content\n");
			return generate(input);
		});
		await expect(f.review()).rejects.toThrow("changed");
		expect(f.model.generate).toHaveBeenCalledOnce();
		expect(f.files.write).not.toHaveBeenCalled();
		expect(f.files.writeApproval).not.toHaveBeenCalled();
		expect(f.files.notes.get(f.candidate.path)).toBe(changed === "target" ? "Changed content\n" : undefined);
		expect(f.state.read(reviewPath("pending", f.candidate.id))).toMatchObject({
			value: { id: f.candidate.id, status: "pending" },
		});
		expect(f.state.read(reviewPath("reviewed", f.candidate.id))).toMatchObject({ kind: "missing" });
		expect([...f.state.documents.keys()].filter((path) => path.includes("/model-audits/"))).toEqual([]);
	},
);

it.each(["another project", "untrusted", "read-only", "stale binding"] as const)(
	"rejects a caller with %s before generation",
	async (cause) => {
		const f = await fixture(cause === "read-only");
		const errors = {
			"another project": "different project or binding",
			untrusted: "untrusted caller",
			"read-only": "write permission",
			"stale binding": "Knowledge binding changed",
		};
		if (cause === "another project") f.files.access.project = "beta";
		if (cause === "untrusted") f.files.access.trusted = false;
		if (cause === "stale binding") f.input.revision--;
		await expect(f.review()).rejects.toThrow(errors[cause]);
		expect(f.model.generate).not.toHaveBeenCalled();
		expect(f.model.approve).not.toHaveBeenCalled();
		expectPendingWithoutWrite(f);
	},
);

it.each([
	["missing acknowledgement", { autoApply: true }],
	["missing autoApply", { acknowledged: true }],
	["non-boolean autoApply", { acknowledged: true, autoApply: "true" }],
])("rejects %s before generation", async (_case, consent) => {
	const f = await fixture();
	const { revision, id, expectedProposalHash } = f.input;
	await expect(f.review({ revision, id, expectedProposalHash, ...consent })).rejects.toThrow(
		"Confirm model costs",
	);
	expect(f.model.generate).not.toHaveBeenCalled();
	expect(f.model.approve).not.toHaveBeenCalled();
	expectPendingWithoutWrite(f);
});
