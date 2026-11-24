import type { Fact } from "@gyoungwe/plugin-api/p5-inquiry";

const date = "2026-11-24T00:00:00.000Z";

/**
 * One host fact, shaped the way a host would deliver it.
 *
 * The host owns identity and payload; this fixture only fills the fields the
 * projection reads, so a test states the observation it means to make.
 */
export function hostFact(overrides: Partial<Fact> & Pick<Fact, "id" | "sequence">): Fact {
	return {
		kind: "compute",
		entityId: `entity-${overrides.id}`,
		at: date,
		status: "succeeded",
		artifactRefs: [],
		runReceiptRef: null,
		decisionKind: null,
		summary: `host summary ${overrides.id}`,
		basis: [],
		...overrides,
	};
}
