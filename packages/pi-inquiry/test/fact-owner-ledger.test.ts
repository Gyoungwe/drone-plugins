import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { InquiryFactOwner } from "../src/fact-owner.js";
import { hostFact as fact } from "./helpers/fact-fixture.js";
import { it } from "./helpers/ledger-owner-fixture.js";

/** The scope the fake host binds the fixture ledger to. */
const scope = { workspaceId: "actual-workspace", sessionId: "actual-fixture-sdk" };

it("projects a fact into the bound ledger and advances the durable cursor", async ({ ledger }) => {
	const owner = new InquiryFactOwner({
		scope: async () => scope,
		ledger: async () => ledger.owner,
	});
	const signal = ledger.controller.signal;
	expect(await owner.cursor(signal)).toBeNull();
	const acknowledgement = await owner.deliver(
		{ cursor: null, facts: [fact({ id: "a", sequence: 1 })] },
		signal,
	);
	expect(acknowledgement).toEqual({ cursor: "a" });
	expect(await owner.cursor(signal)).toBe("a");
	const snapshot = await ledger.owner.read((service) => service.snapshot());
	expect(snapshot.attempts.map((record) => record.id)).toEqual(["host-fact:compute:entity-a"]);
});

it("keeps the cursor and the projection in the same committed ledger bytes", async ({ ledger }) => {
	const owner = new InquiryFactOwner({
		scope: async () => scope,
		ledger: async () => ledger.owner,
	});
	const signal = ledger.controller.signal;
	await owner.deliver({ cursor: null, facts: [fact({ id: "a", sequence: 1 })] }, signal);
	const bytes = await readFile(join(ledger.binary, "ledger.sqlite"));
	expect(bytes.byteLength).toBeGreaterThan(0);
	await ledger.owner.dispose();
	ledger.owner = await ledger.reopened();
	expect(await owner.cursor(signal)).toBe("a");
	const snapshot = await ledger.owner.read((service) => service.snapshot());
	expect(snapshot.attempts).toHaveLength(1);
});

it("replays a lost acknowledgement without applying the committed prefix twice", async ({ ledger }) => {
	const owner = new InquiryFactOwner({
		scope: async () => scope,
		ledger: async () => ledger.owner,
	});
	const signal = ledger.controller.signal;
	const one = fact({ id: "a", sequence: 1 });
	await owner.deliver({ cursor: null, facts: [one] }, signal);
	const replay = await owner.deliver({ cursor: null, facts: [one] }, signal);
	expect(replay).toEqual({ cursor: "a" });
	const snapshot = await ledger.owner.read((service) => service.snapshot());
	expect(snapshot.attempts).toHaveLength(1);
});

it("does not commit a projection after the caller is revoked", async ({ ledger }) => {
	const owner = new InquiryFactOwner({
		scope: async () => scope,
		ledger: async () => ledger.owner,
	});
	// The host's revocation fence reaches the owner as an aborted signal.
	const revoked = new AbortController();
	revoked.abort(new Error("Caller revoked"));
	await expect(
		owner.deliver({ cursor: null, facts: [fact({ id: "a", sequence: 1 })] }, revoked.signal),
	).rejects.toThrow("Caller revoked");
	const bytes = await readFile(join(ledger.binary, "ledger.sqlite"));
	expect(bytes.equals(ledger.initial)).toBe(true);
	const snapshot = await ledger.owner.read((service) => service.snapshot());
	expect(snapshot.attempts).toHaveLength(0);
});
