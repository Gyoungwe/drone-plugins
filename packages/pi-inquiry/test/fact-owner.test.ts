import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { FactDeliveryConflict } from "../src/fact-delivery-policy.js";
import { hostFactContentHash } from "../src/fact-identity.js";
import { InquiryFactOwner } from "../src/fact-owner.js";
import type { InquiryLedgerOwner } from "../src/ledger-owner.js";
import { InquiryService } from "../src/service.js";
import { createInquiryWasmEngine, type WasmInquiryStorage } from "../src/wasm-storage.js";
import { hostFact as fact } from "./helpers/fact-fixture.js";

const require = createRequire(import.meta.url);

/**
 * A ledger owner over the canonical WASM storage.
 *
 * The owner reads and writes the same projection database, so a transaction
 * that does not advance the cursor leaves nothing behind.
 */
async function createOwner(): Promise<{
	owner: InquiryLedgerOwner;
	storage: WasmInquiryStorage;
	dispose: () => Promise<void>;
}> {
	const engine = await createInquiryWasmEngine(await readFile(require.resolve("sql.js/dist/sql-wasm.wasm")));
	const storage = engine.open("project-1");
	const service = new InquiryService(storage);
	const ledger = {
		read: async <T>(operation: (current: InquiryService) => Promise<T>) => operation(service),
		write: async <T>(_operation: string, mutate: (current: InquiryService) => Promise<T>): Promise<T> =>
			mutate(service),
	} as unknown as InquiryLedgerOwner;
	return {
		owner: ledger,
		storage,
		dispose: async () => {
			await storage.close();
		},
	};
}

async function createFactOwner(): Promise<{
	owner: InquiryFactOwner;
	storage: WasmInquiryStorage;
	scope: { workspaceId: string; sessionId: string };
	dispose: () => Promise<void>;
}> {
	const fixture = await createOwner();
	const scope = { workspaceId: "workspace-1", sessionId: "session-1" };
	return {
		owner: new InquiryFactOwner({
			scope: async () => scope,
			ledger: async () => fixture.owner,
		}),
		storage: fixture.storage,
		scope,
		dispose: fixture.dispose,
	};
}

it("acknowledges nothing before the first delivery", async () => {
	const fixture = await createFactOwner();
	try {
		expect(await fixture.owner.cursor(new AbortController().signal)).toBeNull();
	} finally {
		await fixture.dispose();
	}
});

it("projects a fact and advances the cursor in one transaction", async () => {
	const fixture = await createFactOwner();
	try {
		const acknowledgement = await fixture.owner.deliver(
			{ cursor: null, facts: [fact({ id: "a", sequence: 1 })] },
			new AbortController().signal,
		);
		expect(acknowledgement).toEqual({ cursor: "a" });
		expect(await fixture.owner.cursor(new AbortController().signal)).toBe("a");
		const snapshot = await fixture.storage.snapshot();
		expect(snapshot.attempts.map((record) => record.id)).toEqual(["host-fact:compute:entity-a"]);
		expect(snapshot.attempts[0]?.outcome).toBe("succeeded");
	} finally {
		await fixture.dispose();
	}
});

it("keeps the projection and the cursor together when a delivery is rejected", async () => {
	const fixture = await createFactOwner();
	try {
		const one = fact({ id: "a", sequence: 1 });
		await expect(
			fixture.owner.deliver(
				{ cursor: null, facts: [one, { ...one, status: "failed" }] },
				new AbortController().signal,
			),
		).rejects.toThrow(FactDeliveryConflict);
		expect(await fixture.owner.cursor(new AbortController().signal)).toBeNull();
		expect((await fixture.storage.snapshot()).attempts).toHaveLength(0);
	} finally {
		await fixture.dispose();
	}
});

it("skips a replayed fact without applying it twice", async () => {
	const fixture = await createFactOwner();
	try {
		const one = fact({ id: "a", sequence: 1 });
		await fixture.owner.deliver({ cursor: null, facts: [one] }, new AbortController().signal);
		const replay = await fixture.owner.deliver({ cursor: "a", facts: [one] }, new AbortController().signal);
		expect(replay).toEqual({ cursor: "a" });
		expect((await fixture.storage.snapshot()).attempts).toHaveLength(1);
	} finally {
		await fixture.dispose();
	}
});

it("stops at a gap and acknowledges only the committed prefix", async () => {
	const fixture = await createFactOwner();
	try {
		const acknowledgement = await fixture.owner.deliver(
			{
				cursor: null,
				facts: [fact({ id: "a", sequence: 4 }), fact({ id: "b", sequence: 4 })],
			},
			new AbortController().signal,
		);
		expect(acknowledgement).toEqual({ cursor: "a" });
		expect(await fixture.owner.cursor(new AbortController().signal)).toBe("a");
		const snapshot = await fixture.storage.snapshot();
		expect(snapshot.attempts.map((record) => record.id)).toEqual(["host-fact:compute:entity-a"]);
	} finally {
		await fixture.dispose();
	}
});

it("refuses to downgrade a terminal outcome", async () => {
	const fixture = await createFactOwner();
	try {
		const terminal = fact({ id: "a", sequence: 1, entityId: "job-1", status: "failed" });
		await fixture.owner.deliver({ cursor: null, facts: [terminal] }, new AbortController().signal);
		const replay = fact({ id: "b", sequence: 2, entityId: "job-1", status: "running" });
		await fixture.owner.deliver({ cursor: "a", facts: [replay] }, new AbortController().signal);
		const snapshot = await fixture.storage.snapshot();
		expect(snapshot.attempts).toHaveLength(1);
		expect(snapshot.attempts[0]?.outcome).toBe("failed");
	} finally {
		await fixture.dispose();
	}
});

it("records a host decision and keeps a revoked decision revoked", async () => {
	const fixture = await createFactOwner();
	try {
		const decision = fact({
			id: "d",
			sequence: 1,
			kind: "decision",
			decisionKind: "compute-submit",
			entityId: "request-1",
		});
		await fixture.owner.deliver({ cursor: null, facts: [decision] }, new AbortController().signal);
		const snapshot = await fixture.storage.snapshot();
		expect(snapshot.decisions).toHaveLength(1);
		expect(snapshot.decisions[0]?.kind).toBe("compute-submit");
	} finally {
		await fixture.dispose();
	}
});

it("rejects a changed duplicate of an already committed fact", async () => {
	const fixture = await createFactOwner();
	try {
		const one = fact({ id: "a", sequence: 1 });
		await fixture.owner.deliver({ cursor: null, facts: [one] }, new AbortController().signal);
		expect(hostFactContentHash(one)).toMatch(/^[a-f0-9]{64}$/);
		await expect(
			fixture.owner.deliver(
				{ cursor: "a", facts: [{ ...one, status: "failed" }] },
				new AbortController().signal,
			),
		).rejects.toThrow(FactDeliveryConflict);
	} finally {
		await fixture.dispose();
	}
});

it("refuses a delivery when the caller is revoked", async () => {
	const fixture = await createFactOwner();
	try {
		const controller = new AbortController();
		controller.abort(new Error("revoked"));
		await expect(
			fixture.owner.deliver({ cursor: null, facts: [fact({ id: "a", sequence: 1 })] }, controller.signal),
		).rejects.toThrow();
		expect(await fixture.owner.cursor(new AbortController().signal)).toBeNull();
	} finally {
		await fixture.dispose();
	}
});
