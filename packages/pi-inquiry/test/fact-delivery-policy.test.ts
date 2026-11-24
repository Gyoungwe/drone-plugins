import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
	type CommittedFactCursor,
	FactDeliveryConflict,
	factCursorKey,
	selectConsumableFacts,
} from "../src/fact-delivery-policy.js";
import { hostFactContentHash } from "../src/fact-identity.js";

import { hostFact as fact } from "./helpers/fact-fixture.js";

it("matches the host contract hash byte for byte", () => {
	// The host hashes [identity, observation] with canonical JSON and SHA-256.
	// A different byte layout would silently break duplicate detection.
	const value = fact({ id: "fact-1", sequence: 3, basis: ["b", "a"] });
	const identity = [value.id, value.kind, value.entityId, value.runReceiptRef, value.basis];
	const observation = [value.at, value.status, value.artifactRefs, value.decisionKind];
	const canonical = (input: unknown): unknown => {
		if (Array.isArray(input)) return input.map(canonical);
		if (!input || typeof input !== "object") return input;
		return Object.fromEntries(
			Object.entries(input as Record<string, unknown>)
				.filter(([, item]) => item !== undefined)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([key, item]) => [key, canonical(item)]),
		);
	};
	expect(hostFactContentHash(value)).toBe(
		createHash("sha256")
			.update(JSON.stringify(canonical([identity, observation])))
			.digest("hex"),
	);
});

it("changes when any identity or observation field changes", () => {
	const base = fact({ id: "fact-1", sequence: 1 });
	const digest = hostFactContentHash(base);
	expect(hostFactContentHash({ ...base, status: "failed" })).not.toBe(digest);
	expect(
		hostFactContentHash({
			...base,
			artifactRefs: [{ id: "a", path: "r", bytes: 1, sha256: "b", parentIds: [], purpose: "input" }],
		}),
	).not.toBe(digest);
	expect(hostFactContentHash({ ...base, basis: ["x"] })).not.toBe(digest);
});

it("separates workspaces, sessions and projection schemas", () => {
	const scope = { workspaceId: "w", sessionId: "s" };
	expect(factCursorKey(scope)).not.toBe(factCursorKey({ ...scope, sessionId: "other" }));
	expect(factCursorKey(scope)).not.toBe(factCursorKey({ ...scope, workspaceId: "other" }));
	expect(factCursorKey(scope)).not.toBe(factCursorKey(scope, 2));
});

it("consumes a batch and acknowledges its last fact", () => {
	const selection = selectConsumableFacts(
		[fact({ id: "a", sequence: 1 }), fact({ id: "b", sequence: 2 })],
		null,
	);
	expect(selection.accepted.map((item) => item.fact.id)).toEqual(["a", "b"]);
	expect(selection.cursor).toBe("b");
	expect(selection.gap).toBe(false);
});

it("accepts sparse sequences because the host numbers sequences per workspace", () => {
	// Another session in the same workspace consumes sequence 2, so this
	// session sees 1 and 3. Numeric adjacency cannot define a missing fact.
	const selection = selectConsumableFacts(
		[fact({ id: "a", sequence: 1 }), fact({ id: "c", sequence: 3 })],
		null,
	);
	expect(selection.accepted.map((item) => item.fact.id)).toEqual(["a", "c"]);
	expect(selection.cursor).toBe("c");
});

it("stops at a sequence that does not advance and keeps the rest pending", () => {
	const selection = selectConsumableFacts(
		[fact({ id: "a", sequence: 4 }), fact({ id: "b", sequence: 4 }), fact({ id: "c", sequence: 9 })],
		null,
	);
	expect(selection.accepted.map((item) => item.fact.id)).toEqual(["a"]);
	expect(selection.cursor).toBe("a");
	expect(selection.gap).toBe(true);
});

it("skips facts at or below the committed prefix", () => {
	const committed: CommittedFactCursor = {
		factId: "b",
		sequence: 5,
		sha256: hostFactContentHash(fact({ id: "b", sequence: 5 })),
	};
	const selection = selectConsumableFacts(
		[fact({ id: "a", sequence: 4 }), fact({ id: "c", sequence: 6 })],
		committed,
	);
	expect(selection.accepted.map((item) => item.fact.id)).toEqual(["c"]);
	expect(selection.cursor).toBe("c");
});

it("replays the committed prefix without applying it twice", () => {
	const committed: CommittedFactCursor = {
		factId: "a",
		sequence: 3,
		sha256: hostFactContentHash(fact({ id: "a", sequence: 3 })),
	};
	const selection = selectConsumableFacts([fact({ id: "a", sequence: 3 })], committed);
	expect(selection.accepted).toEqual([]);
	expect(selection.cursor).toBe("a");
});

it("skips a repeated fact with the same content hash", () => {
	const one = fact({ id: "a", sequence: 1 });
	const selection = selectConsumableFacts([one, { ...one }], null);
	expect(selection.accepted.map((item) => item.fact.id)).toEqual(["a"]);
});

it("rejects a repeated fact whose content changed under the same ID", () => {
	const one = fact({ id: "a", sequence: 1 });
	expect(() => selectConsumableFacts([one, { ...one, status: "failed" }], null)).toThrow(
		FactDeliveryConflict,
	);
});

it("rejects a committed fact whose content changed under the same ID", () => {
	const committed: CommittedFactCursor = {
		factId: "a",
		sequence: 1,
		sha256: hostFactContentHash(fact({ id: "a", sequence: 1 })),
	};
	expect(() => selectConsumableFacts([fact({ id: "a", sequence: 1, status: "failed" })], committed)).toThrow(
		FactDeliveryConflict,
	);
});

it("rejects a fact without a usable identity", () => {
	expect(() => selectConsumableFacts([fact({ id: " ", sequence: 1 })], null)).toThrow(FactDeliveryConflict);
	expect(() => selectConsumableFacts([fact({ id: "a", sequence: 0 })], null)).toThrow(FactDeliveryConflict);
});

it("acknowledges nothing when the batch has no consumable fact", () => {
	expect(selectConsumableFacts([], null).cursor).toBeNull();
});
