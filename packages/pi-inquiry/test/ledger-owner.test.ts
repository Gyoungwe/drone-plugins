import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { inquiryBindingPath } from "../src/ledger-owner.js";
import { hash, it, projectId, question } from "./helpers/ledger-owner-fixture.js";

it("preserves original SQLite bytes, commits canonical SQL, reopens and explicitly restores the original path", async ({
	ledger,
}) => {
	await ledger.owner.write(
		"record-question",
		(service) => service.recordQuestion(question("new")),
		ledger.controller.signal,
	);
	const backup = join(ledger.binary, `ledger.sqlite.pre-plugin-${hash(ledger.initial)}.bak`);
	expect(await readFile(backup)).toEqual(ledger.initial);
	expect((await ledger.owner.snapshot()).questions.map((record) => record.id)).toEqual(["new", "original"]);
	await ledger.owner.dispose();
	ledger.owner = await ledger.reopened();
	expect((await ledger.owner.snapshot()).questions).toHaveLength(2);
	expect(await ledger.owner.restoreOriginal(ledger.controller.signal)).toMatchObject({
		restored: true,
		version: hash(ledger.initial),
	});
	expect(await readFile(join(ledger.binary, "ledger.sqlite"))).toEqual(ledger.initial);
	expect((await ledger.owner.snapshot()).questions.map((record) => record.id)).toEqual(["original"]);
	expect(ledger.engine.inspect(ledger.initial)).toMatchObject({
		projectId,
		schemaVersion: 2,
	});
});
it("retains a durable pending intent on denied write and reconciles the unchanged original without retrying it", async ({
	ledger,
}) => {
	ledger.denyLedgerWrite = true;
	await expect(
		ledger.owner.write(
			"record-question",
			(service) => service.recordQuestion(question("denied")),
			ledger.controller.signal,
		),
	).rejects.toThrow("write denied");
	expect(await readFile(join(ledger.binary, "ledger.sqlite"))).toEqual(ledger.initial);
	await expect(ledger.owner.snapshot()).rejects.toThrow("explicit SHA reconciliation");
	await ledger.owner.dispose();
	ledger.owner = await ledger.reopened();
	ledger.denyLedgerWrite = false;
	const writes = ledger.binaryWrites;
	expect(await ledger.owner.reconcile(ledger.controller.signal)).toMatchObject({
		state: "not-committed",
		version: hash(ledger.initial),
	});
	expect(ledger.binaryWrites).toBe(writes);
	expect((await ledger.owner.snapshot()).questions.map((record) => record.id)).toEqual(["original"]);
});
it("does no new metadata write after revocation and lets a fresh caller reconcile an actually committed candidate", async ({
	ledger,
}) => {
	ledger.cancelAfterCommit = true;
	await expect(
		ledger.owner.write(
			"record-question",
			(service) => service.recordQuestion(question("accepted")),
			ledger.controller.signal,
		),
	).rejects.toMatchObject({ code: "EBINARYWRITEOUTCOMEUNKNOWN" });
	const saved = await ledger.state();
	expect(saved.value.intent?.status).toBe("pending");
	expect(saved.value.headVersion).toBe(hash(ledger.initial));
	const candidate = await readFile(join(ledger.binary, "ledger.sqlite"));
	expect(hash(candidate)).toBe(saved.value.intent?.candidateVersion);
	await ledger.owner.dispose();
	ledger.controller = new AbortController();
	ledger.cancelAfterCommit = false;
	ledger.owner = await ledger.reopened();
	const writes = ledger.binaryWrites;
	expect(await ledger.owner.reconcile(ledger.controller.signal)).toMatchObject({
		state: "committed",
		version: hash(candidate),
	});
	expect(ledger.binaryWrites).toBe(writes);
	expect((await ledger.owner.snapshot()).questions.map((record) => record.id)).toEqual([
		"accepted",
		"original",
	]);
});
it("refuses active WAL sidecars before backup, metadata intent or original mutation", async ({ ledger }) => {
	await writeFile(join(ledger.binary, "ledger.sqlite-wal"), "synthetic active sidecar");
	const before = await ledger.readJson(inquiryBindingPath());
	await expect(
		ledger.owner.write(
			"record-question",
			(service) => service.recordQuestion(question("blocked")),
			ledger.controller.signal,
		),
	).rejects.toThrow("active SQLite sidecar");
	expect(await readFile(join(ledger.binary, "ledger.sqlite"))).toEqual(ledger.initial);
	expect(await ledger.readJson(inquiryBindingPath())).toEqual(before);
	expect(ledger.binaryWrites).toBe(0);
});
it("rejects external SHA changes rather than silently adopting or overwriting them", async ({ ledger }) => {
	await writeFile(join(ledger.binary, "ledger.sqlite"), Buffer.from("different untrusted bytes"));
	await expect(ledger.owner.snapshot()).rejects.toThrow("no automatic adoption");
	expect(ledger.binaryWrites).toBe(0);
});
it("rolls back staged invalid domain mutations without creating a pending intent or changing the original", async ({
	ledger,
}) => {
	await expect(
		ledger.owner.write(
			"invalid-question",
			(service) =>
				service.recordQuestion({
					...question("invalid"),
					projectId: "foreign",
				}),
			ledger.controller.signal,
		),
	).rejects.toThrow("Invalid question record");
	expect(await readFile(join(ledger.binary, "ledger.sqlite"))).toEqual(ledger.initial);
	expect((await ledger.state()).value.intent).toBeNull();
});
