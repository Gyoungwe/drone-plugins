import { isAbsolute, join, resolve } from "node:path";
import { Check } from "typebox/value";
import { knowledgeDirectory } from "./config.js";
import {
	FAILURE_CANDIDATE_KIND,
	FAILURE_CANDIDATE_LIMITS,
	FAILURE_CANDIDATE_VERSION,
	type FailureCandidate,
	type FailureCandidateDocument,
	type FailureCandidateInput,
	type FailureCandidateQuery,
	type FailureCandidateQueryResult,
	type FailureCandidateRecordResult,
	type FailureCandidateScope,
	failureCandidateSafety,
} from "./failure-candidate-contract.js";
import { createNativeFailureCandidateState } from "./failure-candidate-node-state.js";
import {
	CORRUPT_FAILURE_CANDIDATE_DOCUMENT,
	failureCandidateDedupKey,
	failureCandidateQuerySchema,
	HALF_LIFE_MS,
	HARD_TTL_MS,
	MAX_WEIGHT,
	MIN_LIVE_WEIGHT,
	parseFailureCandidateDocument,
	sanitizeFailureCandidateInput,
	serializeFailureCandidateDocument,
} from "./failure-candidate-sanitize.js";
import { isProjectSlug } from "./project-identity.js";
import { runRuntimeExclusive } from "./runtime-host.js";

export {
	FAILURE_CANDIDATE_KIND,
	FAILURE_CANDIDATE_LIMITS,
	FAILURE_CANDIDATE_VERSION,
	type FailureCandidate,
	type FailureCandidateDocument,
	type FailureCandidateInput,
	type FailureCandidateProvenance,
	type FailureCandidateQuery,
	type FailureCandidateQueryResult,
	type FailureCandidateRecordResult,
	type FailureCandidateScope,
} from "./failure-candidate-contract.js";

export interface FailureCandidateState {
	read(path: string): Promise<{ value: unknown; version: string } | null>;
	write(path: string, value: FailureCandidateDocument, expectedVersion: string | null): Promise<void>;
}

export type FailureCandidateStoreOptions = FailureCandidateScope & { clock?: () => number } & (
		| { state: FailureCandidateState; storageKey: string; directory?: never }
		| { state?: never; storageKey?: never; directory?: string }
	);

export interface FailureCandidateStore {
	readonly path: string;
	record(input: FailureCandidateInput): Promise<FailureCandidateRecordResult>;
	query(input?: FailureCandidateQuery): Promise<FailureCandidateQueryResult>;
}

const age = (candidate: FailureCandidate, now: number) => Math.max(0, now - Date.parse(candidate.lastSeenAt));
const effectiveWeight = (candidate: FailureCandidate, now: number) =>
	candidate.weight * 0.5 ** (age(candidate, now) / HALF_LIFE_MS);

function liveCandidates(document: FailureCandidateDocument, now: number): FailureCandidate[] {
	return document.candidates.filter(
		(candidate) => age(candidate, now) < HARD_TTL_MS && effectiveWeight(candidate, now) >= MIN_LIVE_WEIGHT,
	);
}

function evictionOrder(left: FailureCandidate, right: FailureCandidate, now: number): number {
	return (
		effectiveWeight(left, now) - effectiveWeight(right, now) ||
		left.lastSeenAt.localeCompare(right.lastSeenAt) ||
		left.id.localeCompare(right.id)
	);
}

function nextRecord(
	input: ReturnType<typeof sanitizeFailureCandidateInput>,
	key: string,
	previous: FailureCandidate | undefined,
	now: number,
): FailureCandidate {
	const timestamp = new Date(now).toISOString();
	return Object.freeze({
		...input,
		...failureCandidateSafety,
		id: key,
		dedupKey: key,
		firstSeenAt: previous?.firstSeenAt ?? timestamp,
		lastSeenAt: previous && previous.lastSeenAt > timestamp ? previous.lastSeenAt : timestamp,
		weight: previous ? Math.min(MAX_WEIGHT, effectiveWeight(previous, now) + 1) : 1,
		occurrences: Math.min(999, (previous?.occurrences ?? 0) + 1),
		seenReceiptIds: [...(previous?.seenReceiptIds ?? []), input.provenance.receiptId].slice(
			-FAILURE_CANDIDATE_LIMITS.maxSeenReceipts,
		),
	});
}

function resolveStorage(options: FailureCandidateStoreOptions) {
	const { vaultId, project } = options;
	if (options.state) {
		const path = `failure-candidates/${vaultId}/${project}.json`;
		return { path, location: path, key: JSON.stringify([options.storageKey, path]), state: options.state };
	}
	const directory = options.directory ?? knowledgeDirectory();
	if (!directory || !isAbsolute(directory)) throw new Error("An absolute knowledge directory is required");
	const root = resolve(directory);
	const path = `${vaultId}/failure-candidates/${project}.json`;
	const location = join(root, path);
	return { path, location, key: location, state: createNativeFailureCandidateState(root) };
}

function readClock(clock: () => number): number {
	const now = clock();
	if (!Number.isSafeInteger(now) || now < 0 || now > Date.parse("9999-12-31T23:59:59.999Z"))
		throw new Error("Invalid failure-candidate clock");
	return now;
}

function updateDocument(
	current: FailureCandidateDocument,
	input: ReturnType<typeof sanitizeFailureCandidateInput>,
	now: number,
): { document: FailureCandidateDocument; result: FailureCandidateRecordResult } {
	const active = liveCandidates(current, now);
	const key = failureCandidateDedupKey(input);
	const previous = active.find((candidate) => candidate.dedupKey === key);
	if (previous?.seenReceiptIds.includes(input.provenance.receiptId)) {
		return {
			document: current,
			result: { classification: "duplicate", revision: current.revision, candidate: Object.freeze(previous) },
		};
	}
	if (current.revision === Number.MAX_SAFE_INTEGER) throw new Error("Failure-candidate revision exhausted");
	const candidate = nextRecord(input, key, previous, now);
	const candidates = [...active.filter((entry) => entry.id !== key), candidate]
		.sort((left, right) => evictionOrder(left, right, now))
		.slice(-FAILURE_CANDIDATE_LIMITS.maxCandidates);
	const revision = current.revision + 1;
	return {
		document: { ...current, revision, candidates },
		result: { classification: previous ? "merged" : "created", candidate, revision },
	};
}

async function readDocument(state: FailureCandidateState, path: string, scope: FailureCandidateScope) {
	const snapshot = await state.read(path).catch((error: NodeJS.ErrnoException | null) => {
		if (error?.code === "ESTATECORRUPTED") throw new Error(CORRUPT_FAILURE_CANDIDATE_DOCUMENT);
		throw error;
	});
	const document: FailureCandidateDocument = snapshot
		? parseFailureCandidateDocument(snapshot.value, scope)
		: {
				version: FAILURE_CANDIDATE_VERSION,
				kind: FAILURE_CANDIDATE_KIND,
				...scope,
				revision: 0,
				candidates: [],
			};
	return { document, version: snapshot?.version ?? null };
}

export function createFailureCandidateStore(options: FailureCandidateStoreOptions): FailureCandidateStore {
	const { vaultId, project, clock = Date.now } = options;
	if (typeof vaultId !== "string" || !/^[a-f0-9]{24}$/.test(vaultId) || !isProjectSlug(project))
		throw new Error("Invalid failure-candidate scope");
	const { path, location, key, state } = resolveStorage(options);
	const read = () => readDocument(state, path, { vaultId, project });
	return {
		path: location,
		async record(input) {
			const clean = sanitizeFailureCandidateInput(input);
			return runRuntimeExclusive("failure-candidate-store", key, async () => {
				const now = readClock(clock);
				for (let retry = 0; ; retry++) {
					const { document: current, version } = await read();
					const { document, result } = updateDocument(current, clean, now);
					if (result.classification === "duplicate") return result;
					if (
						Buffer.byteLength(serializeFailureCandidateDocument(document)) >
						FAILURE_CANDIDATE_LIMITS.maxFileBytes
					)
						throw new Error("Failure-candidate document exceeds 256 KiB");
					try {
						await state.write(path, document, version);
						return result;
					} catch (error) {
						const code = (error as NodeJS.ErrnoException | null)?.code;
						if (code === "ESTATECORRUPTED") throw new Error(CORRUPT_FAILURE_CANDIDATE_DOCUMENT);
						if (code !== "ESTATECONFLICT" || retry >= 2) throw error;
					}
				}
			});
		},
		async query(input = {}) {
			if (!Check(failureCandidateQuerySchema, input)) throw new Error("Invalid failure-candidate query");
			const { document } = await read();
			const now = readClock(clock);
			const candidates = liveCandidates(document, now)
				.sort((left, right) => evictionOrder(right, left, now))
				.slice(0, input.limit ?? FAILURE_CANDIDATE_LIMITS.maxQueryLimit)
				.map((candidate) =>
					Object.freeze({ ...candidate, effectiveWeight: effectiveWeight(candidate, now) }),
				);
			return { revision: document.revision, candidates };
		},
	};
}
