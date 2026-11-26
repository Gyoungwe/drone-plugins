import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
	createFailureCandidateStore,
	type FailureCandidateInput,
	type FailureCandidateState,
} from "../src/core/failure-candidate-store.js";

const scope = { vaultId: "0123456789abcdef01234567", project: "project-a" };
const start = Date.parse("2026-11-26T00:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const navigation = {
	navigationOnly: true,
	evidenceEligible: false,
	instructionEligible: false,
	authorityEligible: false,
	status: "candidate",
};

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function nativeStore() {
	const directory = await mkdtemp(join(tmpdir(), "drone-failure-candidates-"));
	roots.push(directory);
	const time = { now: start };
	const options = { ...scope, directory, clock: () => time.now };
	return { directory, time, options, store: createFailureCandidateStore(options) };
}

function input(
	receiptId = "receipt-1",
	overrides: Partial<FailureCandidateInput> = {},
): FailureCandidateInput {
	return {
		failureCode: "breaker:stalled",
		subject: "Source lookup",
		scopeKind: "project",
		summary: "The search stalled before returning any sources.",
		provenance: { sourcePlugin: "drone-pi-research", producer: "research-loop", receiptId },
		...overrides,
	};
}

it("creates a navigation candidate, ignores a seen receipt and merges a new receipt after decay", async () => {
	const { store, time } = await nativeStore();
	expect(await store.query()).toEqual({ revision: 0, candidates: [] });
	const created = await store.record(input());
	const hash = createHash("sha256")
		.update("research-loop\0breaker:stalled\0source lookup\0project")
		.digest("hex");
	expect(created).toMatchObject({
		classification: "created",
		revision: 1,
		candidate: {
			...navigation,
			dedupKey: hash.slice(0, 32),
			weight: 1,
			occurrences: 1,
			seenReceiptIds: ["receipt-1"],
		},
	});
	time.now += 7 * day;
	expect(await store.record(input("receipt-1", { subject: "ＳＯＵＲＣＥ   lookup" }))).toEqual({
		...created,
		classification: "duplicate",
	});
	expect((await store.query()).candidates[0]?.effectiveWeight).toBe(0.5);
	const merged = await store.record(
		input("receipt-2", { summary: "Lookup stalled again", nextHint: "Try later" }),
	);
	expect(merged).toMatchObject({
		classification: "merged",
		revision: 2,
		candidate: {
			...navigation,
			id: created.candidate.id,
			weight: 1.5,
			occurrences: 2,
			seenReceiptIds: ["receipt-1", "receipt-2"],
			summary: "Lookup stalled again",
			nextHint: "Try later",
		},
	});
});

it("keeps the last eight receipts and caps the reinforced weight", async () => {
	const { store } = await nativeStore();
	for (let index = 1; index <= 12; index++) await store.record(input(`receipt-${index}`));
	const duplicate = await store.record(input("receipt-5"));
	expect(duplicate).toMatchObject({
		classification: "duplicate",
		revision: 12,
		candidate: {
			weight: 10,
			occurrences: 12,
			seenReceiptIds: Array.from({ length: 8 }, (_, index) => `receipt-${index + 5}`),
		},
	});
	expect(await store.record(input("receipt-4"))).toMatchObject({ classification: "merged", revision: 13 });
});

it("filters by decay and hard TTL without writing, then prunes on record", async () => {
	const { store, time } = await nativeStore();
	await store.record(input());
	for (let index = 0; index < 10; index++)
		await store.record(input(`strong-${index}`, { subject: "Repeated failure" }));
	const persisted = await readFile(store.path, "utf8");
	time.now = start + 21 * day;
	expect((await store.query()).candidates.map((candidate) => candidate.effectiveWeight)).toEqual([
		1.25, 0.125,
	]);
	time.now = start + 30 * day - 1;
	expect((await store.query()).candidates.map((candidate) => candidate.subject)).toEqual([
		"Repeated failure",
	]);
	time.now += 1;
	expect(await store.query()).toEqual({ revision: 11, candidates: [] });
	expect(await readFile(store.path, "utf8")).toBe(persisted);
	await store.record(input("new-receipt", { subject: "New failure" }));
	expect(await readFile(store.path, "utf8")).not.toMatch(/Repeated failure|Source lookup/);
});

it("keeps the fresh candidate and evicts the lowest decayed weight with stable ties", async () => {
	const { store, time } = await nativeStore();
	const ids: string[] = [];
	await store.record(input("old", { subject: "Older failure" }));
	time.now += day;
	for (let index = 0; index < 63; index++) {
		const result = await store.record(input(`receipt-${index}`, { subject: `Failure ${index}` }));
		ids.push(result.candidate.id);
	}
	time.now += 7 * day;
	await store.record(input("fresh-1", { subject: "Fresh failure 1" }));
	await store.record(input("fresh-2", { subject: "Fresh failure 2" }));
	const document = JSON.parse(await readFile(store.path, "utf8")) as {
		candidates: { id: string; subject: string }[];
	};
	expect(document.candidates).toHaveLength(64);
	expect(document.candidates.map((candidate) => candidate.id)).not.toContain(ids.sort()[0]);
	expect(document.candidates.map((candidate) => candidate.subject)).not.toContain("Older failure");
	expect((await store.query()).candidates).toHaveLength(16);
	expect((await store.query({ limit: 2 })).candidates.map((candidate) => candidate.subject).sort()).toEqual([
		"Fresh failure 1",
		"Fresh failure 2",
	]);
});

it("redacts text, bounds metadata and keeps only opaque provenance references", async () => {
	const { store } = await nativeStore();
	const { candidate } = await store.record(
		input("receipt-1", {
			subject: `Source\u0000${"x".repeat(200)}`,
			summary:
				"Bearer synthetic-bearer API_KEY='synthetic key' https://synthetic-user:cookie=fake@example.test/path?private=value#fragment",
			reason: `Cookie: first=synthetic-cookie; second=synthetic-second\n${"r".repeat(500)}`,
			nextHint: "password=synthetic-password",
			tags: Array.from({ length: 12 }, (_, index) => `tag-${index}-${"t".repeat(80)}`),
		}),
	);
	expect(candidate.subject).toHaveLength(180);
	expect(candidate.reason).toHaveLength(240);
	expect(candidate.nextHint).toBe("password=[redacted]");
	expect(candidate.tags).toHaveLength(8);
	const persisted = await readFile(store.path, "utf8");
	expect(persisted).toContain("https://example.test/path");
	expect(persisted).not.toMatch(/synthetic|user:pass|private=value|#fragment|\\u0000/);
	expect((await store.query()).candidates[0]).toEqual({ ...candidate, effectiveWeight: 1 });
	await expect(store.record(input("token:synthetic-id"))).rejects.toThrow("Invalid failure-candidate input");
});

it("reopens the separate native queue and preserves other projects and the experience file", async () => {
	const { directory, store, options } = await nativeStore();
	const experience = join(directory, scope.vaultId, "experience", scope.project, "host.json");
	await mkdir(dirname(experience), { recursive: true });
	await writeFile(experience, "legacy experience bytes");
	const record = await store.record(input());
	expect(store.path).toBe(join(directory, scope.vaultId, "failure-candidates", `${scope.project}.json`));
	expect(await readdir(dirname(store.path))).toEqual([`${scope.project}.json`]);
	expect(await createFailureCandidateStore(options).query()).toEqual({
		revision: 1,
		candidates: [{ ...record.candidate, effectiveWeight: 1 }],
	});
	expect(await createFailureCandidateStore({ ...options, project: "project-b" }).query()).toEqual({
		revision: 0,
		candidates: [],
	});
	expect(await readFile(experience, "utf8")).toBe("legacy experience bytes");
});

it.each([
	["navigationOnly", false],
	["evidenceEligible", true],
	["instructionEligible", true],
	["authorityEligible", true],
	["status", "verified"],
	["summary", "token=synthetic-tamper"],
])("fails closed when stored %s is tampered with", async (field, value) => {
	const { store } = await nativeStore();
	await store.record(input());
	const document = JSON.parse(await readFile(store.path, "utf8")) as {
		candidates: Record<string, unknown>[];
	};
	const tampered = JSON.stringify({
		...document,
		candidates: [{ ...document.candidates[0], [field]: value }],
	});
	await writeFile(store.path, tampered);
	await expect(store.query()).rejects.toThrow("Corrupt failure-candidate document");
	await expect(store.record(input("new"))).rejects.toThrow("Corrupt failure-candidate document");
	expect(await readFile(store.path, "utf8")).toBe(tampered);
});

it("fails closed on broken JSON and on an oversized file with otherwise valid contents", async () => {
	const { store } = await nativeStore();
	await store.record(input());
	const valid = await readFile(store.path, "utf8");
	for (const invalid of ["{broken", `${valid}${" ".repeat(256 * 1024)}`]) {
		await writeFile(store.path, invalid);
		await expect(store.query()).rejects.toThrow("Corrupt failure-candidate document");
		await expect(store.record(input("new"))).rejects.toThrow("Corrupt failure-candidate document");
		expect(await readFile(store.path, "utf8")).toBe(invalid);
	}
});

it("rejects unsafe scope segments and refuses to follow a symlink into experience state", async () => {
	const { directory, store, options } = await nativeStore();
	const experience = join(directory, scope.vaultId, "experience");
	await mkdir(experience, { recursive: true });
	await symlink(experience, dirname(store.path), "dir");
	expect(() => createFailureCandidateStore({ ...options, project: "../experience" })).toThrow(
		"Invalid failure-candidate scope",
	);
	await expect(store.record(input())).rejects.toThrow("Corrupt failure-candidate document");
	expect(await readdir(experience)).toEqual([]);
});

it("serializes parallel record operations across native store instances", async () => {
	const { options, store } = await nativeStore();
	const reopened = createFailureCandidateStore(options);
	await Promise.all([
		store.record(input("first")),
		reopened.record(input("second")),
		store.record(input("third")),
	]);
	expect(await store.query()).toMatchObject({ revision: 3, candidates: [{ occurrences: 3, weight: 3 }] });
});

function memoryState(): FailureCandidateState {
	const entries = new Map<string, NonNullable<Awaited<ReturnType<FailureCandidateState["read"]>>>>();
	return {
		async read(path) {
			return structuredClone(entries.get(path) ?? null);
		},
		async write(path, value, expectedVersion) {
			if ((entries.get(path)?.version ?? null) !== expectedVersion)
				throw Object.assign(new Error("State version conflict"), { code: "ESTATECONFLICT" });
			entries.set(path, { value: structuredClone(value), version: `snapshot-${value.revision}` });
		},
	};
}

it("leaves the prior revision intact if recording would exceed 256 KiB", async () => {
	const state = memoryState();
	const store = createFailureCandidateStore({ ...scope, state, storageKey: "budget", clock: () => start });
	const large = (index: number) =>
		input(`receipt-${index}`, {
			failureCode: "码".repeat(64),
			subject: `${index}${"题".repeat(178)}`,
			summary: "述".repeat(400),
			reason: "因".repeat(240),
			nextHint: "步".repeat(240),
			tags: Array.from({ length: 8 }, (_, tag) => `${tag}${"签".repeat(63)}`),
		});
	for (let index = 0; index < 64; index++) {
		const before = await state.read(store.path);
		try {
			await store.record(large(index));
		} catch (error) {
			expect(error).toMatchObject({ message: "Failure-candidate document exceeds 256 KiB" });
			expect(before).not.toBeNull();
			expect(await state.read(store.path)).toEqual(before);
			return;
		}
	}
	throw new Error("The queue accepted more than 256 KiB");
});

it("saturates the occurrence count while retaining new receipt identities", async () => {
	const state = memoryState();
	const store = createFailureCandidateStore({
		...scope,
		state,
		storageKey: "occurrences",
		clock: () => start,
	});
	for (let index = 0; index < 1000; index++) await store.record(input(`receipt-${index}`));
	expect(await store.record(input("latest"))).toMatchObject({
		classification: "merged",
		revision: 1001,
		candidate: { occurrences: 999, seenReceiptIds: expect.arrayContaining(["latest"]) },
	});
});

it("reloads state after a CAS conflict and preserves the intervening receipt", async () => {
	const state = memoryState();
	const options = { ...scope, state, clock: () => start };
	const external = createFailureCandidateStore({ ...options, storageKey: "external" });
	const write = vi.fn(state.write).mockImplementationOnce(async (path, value, expectedVersion) => {
		await external.record(input("external-receipt"));
		await state.write(path, value, expectedVersion);
	});
	const store = createFailureCandidateStore({ ...options, storageKey: "local", state: { ...state, write } });
	expect(await store.record(input())).toMatchObject({
		classification: "merged",
		revision: 2,
		candidate: { seenReceiptIds: ["external-receipt", "receipt-1"] },
	});
	expect(write.mock.calls.map(([, , version]) => version)).toEqual([null, "snapshot-1"]);
});

it.each([
	["ESTATECONFLICT", 3],
	["EACCES", 1],
])("bounds retries for %s to %d write attempts", async (code, attempts) => {
	const state = memoryState();
	const write = vi
		.fn<FailureCandidateState["write"]>()
		.mockRejectedValue(Object.assign(new Error(code), { code }));
	const store = createFailureCandidateStore({ ...scope, storageKey: "test", state: { ...state, write } });
	await expect(store.record(input())).rejects.toThrow(code);
	expect(write).toHaveBeenCalledTimes(attempts);
	expect(await store.query()).toEqual({ revision: 0, candidates: [] });
});
