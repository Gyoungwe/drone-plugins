import {
	acceptanceKinds,
	acceptanceVerifier,
	acceptanceVerifiers,
	CORE_ACCEPTANCE_KINDS,
	effectiveAcceptance,
	type TaskAcceptanceVerifier,
} from "./acceptance.js";
import { clean, type TaskOperation, type TaskRecord } from "./workbench-state.js";

type Verifier = Pick<TaskAcceptanceVerifier, "kind" | "fields" | "evidenceKind" | "operationVerifier"> &
	Partial<TaskAcceptanceVerifier>;
export type VerifierLookup = (kind: string | undefined) => Verifier | null;
type VerifierOverrides = Record<string, Partial<TaskAcceptanceVerifier> | null>;

export function workbenchVerifiers(overrides: VerifierOverrides | null) {
	const verifierFor: VerifierLookup = (kind) => {
		if (overrides && kind !== undefined && Object.hasOwn(overrides, kind)) {
			const verifier = overrides[kind];
			return verifier
				? {
						fields: [],
						evidenceKind: `${kind}-verified`,
						operationVerifier: `${kind}-record-not-scientific-proof`,
						...verifier,
						kind,
					}
				: null;
		}
		return acceptanceVerifier(kind);
	};
	return {
		verifierFor,
		allVerifiers: () =>
			[
				...new Set([
					...acceptanceVerifiers().map((verifier) => verifier.kind),
					...Object.keys(overrides || {}),
				]),
			]
				.map(verifierFor)
				.filter((verifier): verifier is Verifier => !!verifier),
		knownKinds: () => [
			...new Set([...CORE_ACCEPTANCE_KINDS, ...acceptanceKinds(), ...Object.keys(overrides || {})]),
		],
	};
}

export const sameIdentity = (first: unknown, second: unknown) =>
	!!first && !!second && String(first).trim().toLowerCase() === String(second).trim().toLowerCase();

export interface IdentityObservation {
	toolCallId: string;
	toolName: string;
	kind: string;
	identity: unknown;
}

export function bindIdentity(
	task: TaskRecord,
	verifier: Verifier,
	identity: unknown,
	operation: Pick<TaskOperation, "tool" | "identityMilestoneId"> & { id: string | null },
	now: () => string,
) {
	if (!identity || typeof identity !== "object") return null;
	const fields: Record<string, string> = {};
	for (const field of verifier.fields || []) {
		const value = (identity as Record<string, unknown>)[field];
		if (typeof value === "string" && value.trim()) fields[field] = clean(value, 512);
	}
	const keys = Object.keys(fields);
	if (!keys.length) return null;
	const candidates = task.milestones.filter((milestone) => milestone.acceptance?.kind === verifier.kind);
	if (!candidates.length) return null;
	const matches = (values: Readonly<Record<string, unknown>>) =>
		keys.every((key) => sameIdentity(values[key], fields[key]));
	const named = candidates.find((milestone) => matches(effectiveAcceptance(milestone)));
	if (named) {
		operation.identityMilestoneId = named.id;
		return null;
	}
	const slot = candidates.find((milestone) => {
		const current = effectiveAcceptance(milestone);
		return milestone.state !== "completed" && keys.every((key) => !current[key]);
	});
	if (!slot) {
		task.unboundIdentities = [
			...(task.unboundIdentities || []).filter((value) => !matches(value)),
			{ kind: verifier.kind, ...fields, tool: operation.tool || null, at: now() },
		].slice(-8);
		return null;
	}
	slot.bound = {
		fields,
		via: operation.tool || "tool-receipt",
		operationId: operation.id || null,
		at: now(),
	};
	slot.evidence = null;
	operation.identityMilestoneId = slot.id;
	return slot;
}
