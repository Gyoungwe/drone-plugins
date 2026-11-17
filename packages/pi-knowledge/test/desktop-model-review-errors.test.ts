import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { KnowledgeModelReviewResult } from "../src/desktop/contract.js";
import { errorFixture } from "./helpers/model-review-error-fixture.js";
import { cleanReview, reviewPath, selection } from "./helpers/model-review-verdict-fixture.js";

type Fixture = Awaited<ReturnType<typeof errorFixture>>;
type Outcome = { kind: "returned"; value: unknown } | { kind: "thrown"; error: unknown };
const fixtures: Fixture[] = [];
afterEach(async () => {
	for (const fixture of fixtures.splice(0)) await fixture.dispose();
});

async function fixture() {
	const owner = await errorFixture();
	fixtures.push(owner);
	return owner;
}

function settle(operation: Promise<unknown>): Promise<Outcome> {
	return operation.then(
		(value) => ({ kind: "returned", value }),
		(error) => ({ kind: "thrown", error }),
	);
}

function errorSurface(error: unknown): unknown {
	return error instanceof Error
		? { string: String(error), name: error.name, message: error.message, cause: errorSurface(error.cause) }
		: error;
}

function surfaces(outcome: Outcome) {
	if (outcome.kind === "thrown") {
		expect(outcome.error).toBeInstanceOf(Error);
		const error = outcome.error as Error;
		expect(error.name).toBe("Error");
		expect(error.message.length).toBeGreaterThan(0);
		return [JSON.stringify(errorSurface(error)), error.message];
	}
	const result = outcome.value as KnowledgeModelReviewResult;
	expect(result).toMatchObject({
		...cleanReview(),
		model: `${selection.provider}/${selection.model}`,
		canAutoApply: true,
		autoApplyAuthorized: true,
		applied: false,
		humanReviewed: false,
		scientificallyVerified: false,
		applyError: expect.any(String),
	});
	expect(result.applyError?.length).toBeGreaterThan(0);
	expect(result).not.toHaveProperty("writeResult");
	expect(result).not.toHaveProperty("partial");
	expect(result).not.toHaveProperty("auditSaveError");
	return [JSON.stringify(result), String(result.applyError)];
}

function expectPending(f: Fixture, before: Map<string, string>, auditAllowed: boolean) {
	expect(f.files.write).not.toHaveBeenCalled();
	expect(f.files.writeApproval).not.toHaveBeenCalled();
	expect(f.files.notes.has(f.candidate.path)).toBe(false);
	expect(f.state.read(reviewPath("pending", f.candidate.id))).toMatchObject({ value: f.candidate });
	expect(f.state.read(reviewPath("reviewed", f.candidate.id))).toMatchObject({ kind: "missing" });
	expect(f.state.read(reviewPath("pending", f.other.id))).toMatchObject({ value: f.other });
	if (!auditAllowed) {
		expect(f.state.documents).toEqual(before);
		expect(f.stateCall.mock.calls.filter(([name]) => name !== "state.readJson")).toEqual([]);
	} else {
		const changed = [...f.state.documents].filter(([path, bytes]) => before.get(path) !== bytes);
		expect(changed).toHaveLength(2);
		for (const [path] of changed) expect(path).toContain("/model-audits/");
	}
}

async function expectRecovery(f: Fixture) {
	const result = await f.review();
	expect(result).toMatchObject({
		verdict: "approve",
		applied: true,
		partial: false,
		writeResult: { vaultWritten: true, reviewRecorded: true, indexed: true },
	});
	expect(f.files.write).toHaveBeenCalledExactlyOnceWith(f.candidate.path, f.candidate.after);
	expect(f.files.notes.get(f.candidate.path)).toBe(f.candidate.after);
	expect(f.state.read(reviewPath("pending", f.candidate.id))).toMatchObject({ kind: "missing" });
	expect(f.state.read(reviewPath("reviewed", f.candidate.id))).toMatchObject({
		value: { status: "applied", modelReview: { verdict: "approve" } },
	});
	expect(await f.info()).toMatchObject({ lastReview: result });
	return JSON.stringify(result);
}

async function observe(trigger: (f: Fixture, diagnostic: string) => Promise<Outcome>, auditAllowed = false) {
	const f = await fixture();
	const marker = `SYNTHETIC-SECRET-MARKER-${randomUUID()}`;
	const diagnostic = `Synthetic failure: Authorization: Bearer ${marker}; api_key=${marker}`;
	const before = new Map(f.state.documents);
	const outcome = await trigger(f, diagnostic);
	const text = surfaces(outcome);
	expect(f.model.generate).toHaveBeenCalledOnce();
	expectPending(f, before, auditAllowed);
	const info = await f.info();
	expect(info).toMatchObject({ lastReview: outcome.kind === "returned" ? outcome.value : null });
	text.push(JSON.stringify(info));
	for (const path of f.state.documents.keys()) text.push(JSON.stringify(f.state.read(path)));
	text.push(await expectRecovery(f));
	for (const path of f.state.documents.keys()) text.push(JSON.stringify(f.state.read(path)));
	return { marker, text, outcome, diagnostic };
}

async function rejectedGeneration(f: Fixture, diagnostic: string) {
	f.model.generate.mockRejectedValueOnce(new Error(diagnostic, { cause: new Error(diagnostic) }));
	const outcome = await settle(f.review());
	expect(outcome.kind).toBe("thrown");
	return outcome;
}

async function invalidGeneration(f: Fixture, diagnostic: string) {
	f.model.generate.mockResolvedValueOnce({
		selection,
		value: { ...cleanReview(), summary: diagnostic, verdict: "provider-error", cautions: [diagnostic] },
		usage: { inputTokens: 40, outputTokens: 20, cost: null },
	});
	const outcome = await settle(f.review());
	expect(outcome).toEqual({
		kind: "thrown",
		error: new Error("Invalid or incomplete model review; no candidate was applied"),
	});
	return outcome;
}

function deferred<T>() {
	let resolve: (value: T) => void;
	let reject: (reason: unknown) => void;
	const promise = new Promise<T>((accept, refuse) => {
		resolve = accept;
		reject = refuse;
	});
	return { promise, resolve: (value: T) => resolve(value), reject: (reason: unknown) => reject(reason) };
}

async function canceledGeneration(f: Fixture, diagnostic: string) {
	const entered = deferred<void>();
	const late = deferred<Awaited<ReturnType<typeof f.model.generate>>>();
	const canceled = new AbortController();
	f.model.generate.mockImplementationOnce(() => {
		entered.resolve();
		return late.promise;
	});
	const pending = settle(f.review(canceled.signal));
	await entered.promise;
	canceled.abort(new Error("Synthetic caller canceled review"));
	expect(canceled.signal.aborted).toBe(true);
	expect(f.files.write).not.toHaveBeenCalled();
	late.reject(new Error(diagnostic, { cause: new Error(diagnostic) }));
	const outcome = await pending;
	expect(outcome.kind).toBe("thrown");
	return outcome;
}

async function failedWrite(f: Fixture, diagnostic: string, port: "audit" | "vault") {
	const spy = port === "audit" ? f.stateCall : f.filesCall;
	const original = spy.getMockImplementation();
	if (!original) throw new Error("Expected the synthetic write broker implementation");
	const refuse = vi.fn().mockImplementationOnce(() => {
		throw new Error(diagnostic);
	});
	spy.mockImplementation(async (name, input) => {
		if (name === (port === "audit" ? "state.writeJson" : "files.writeText")) refuse();
		return original(name, input);
	});
	const outcome = await settle(f.review());
	expect(refuse).toHaveBeenCalled();
	expect(outcome.kind).toBe("returned");
	expect(f.stateCall.mock.calls.filter(([name]) => name === "state.writeJson")).toHaveLength(
		port === "audit" ? 3 : 4,
	);
	return outcome;
}

const cases = [
	{ name: "a: rejected generation", trigger: rejectedGeneration, auditAllowed: false },
	{ name: "b: schema-invalid generation", trigger: invalidGeneration, auditAllowed: false },
	{ name: "c: cancellation followed by late rejection", trigger: canceledGeneration, auditAllowed: false },
	{
		name: "d: audit write failure after clean approval",
		trigger: (f: Fixture, diagnostic: string) => failedWrite(f, diagnostic, "audit"),
		auditAllowed: true,
	},
	{
		name: "d: Vault write failure after clean approval",
		trigger: (f: Fixture, diagnostic: string) => failedWrite(f, diagnostic, "vault"),
		auditAllowed: true,
	},
];

it.each(cases)("fails visibly, keeps the candidate pending and recovers ($name)", async (scenario) => {
	const { outcome, diagnostic } = await observe(scenario.trigger, scenario.auditAllowed);
	if (outcome.kind === "returned") {
		expect((outcome.value as KnowledgeModelReviewResult).applyError === diagnostic).toBe(true);
	} else if (scenario.trigger !== invalidGeneration) {
		const expected = {
			string: `Error: ${diagnostic}`,
			name: "Error",
			message: diagnostic,
			cause: { string: `Error: ${diagnostic}`, name: "Error", message: diagnostic },
		};
		expect(JSON.stringify(errorSurface(outcome.error)) === JSON.stringify(expected)).toBe(true);
	}
});

it("excludes schema-invalid provider fields from every surfaced and persisted diagnostic", async () => {
	const { marker, text } = await observe(invalidGeneration);
	expect(text.map((value) => value.includes(marker))).not.toContain(true);
});

// R21: raw generation/cancellation errors and write failures leak through owner errors or applyError audits/UI.
it.fails.each(cases.filter((scenario) => scenario.trigger !== invalidGeneration))(
	"excludes the secret marker from errors, audits, receipts and UI text ($name)",
	async (scenario) => {
		const { marker, text } = await observe(scenario.trigger, scenario.auditAllowed);
		expect(text.map((value) => value.includes(marker))).not.toContain(true);
	},
);
