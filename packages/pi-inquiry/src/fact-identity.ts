import { createHash } from "node:crypto";
import type { Fact } from "@gyoungwe/plugin-api/p5-inquiry";

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, item]) => [key, canonicalize(item)]),
	);
}

/**
 * Content hash of one host fact's identity and observation.
 *
 * The host owns the fact ID, the sequence and the payload; this package only
 * compares what the host already delivered. The hash covers the same identity
 * and observation split the host journal uses, so a changed payload under an
 * unchanged ID is detectable without trusting any host prose.
 */
export function hostFactContentHash(fact: Fact): string {
	const identity = [fact.id, fact.kind, fact.entityId, fact.runReceiptRef, fact.basis];
	const observation = [fact.at, fact.status, fact.artifactRefs, fact.decisionKind];
	return createHash("sha256")
		.update(JSON.stringify(canonicalize([identity, observation])))
		.digest("hex");
}
