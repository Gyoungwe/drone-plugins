import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { expect } from "vitest";
import { inquiryBindingPath } from "../src/ledger-owner.js";
import { createInquiryRuntimeWithEngine } from "../src/runtime.js";
import { it, projectId, question, workspaceId } from "./helpers/ledger-owner-fixture.js";

it("serves the generic provider through the same canonical owner and labels JSON as asserted data", async ({
	ledger,
}) => {
	const runtime = await createInquiryRuntimeWithEngine(
		{
			applicationId: "app",
			signal: ledger.controller.signal,
			resources: [],
			capabilities: ledger.ports,
			events: { changed() {} },
		},
		ledger.engine,
	);
	const context = {
		scope: {
			kind: "session" as const,
			workspaceId,
			workspaceDirectory: ledger.directory,
			sessionId: "actual-fixture-sdk",
		},
		signal: ledger.controller.signal,
		capabilities: ledger.ports,
	};
	try {
		const result = await runtime.operations["inquiry.write"].execute(
			{ action: "recordQuestion", record: question("provider") },
			context,
		);
		expect(result).toMatchObject({
			value: null,
			authority: "plugin-asserted-or-imported",
		});
		const snapshot = (await runtime.operations["inquiry.read"].execute({ action: "snapshot" }, context)) as {
			value: { questions: { id: string }[] };
		};
		expect(snapshot.value.questions.map((record) => record.id)).toEqual(["original", "provider"]);
	} finally {
		await runtime.dispose();
	}
	await expect(runtime.operations["inquiry.read"].execute({ action: "snapshot" }, context)).rejects.toThrow(
		"stopping",
	);
});

it("requires explicit existing-data binding through actual root handles without changing original bytes", async ({
	ledger,
}) => {
	await rm(join(ledger.json, inquiryBindingPath()));
	const runtime = await createInquiryRuntimeWithEngine(
		{
			applicationId: "app",
			signal: ledger.controller.signal,
			resources: [],
			capabilities: ledger.ports,
			events: { changed() {} },
		},
		ledger.engine,
	);
	const context = {
		scope: {
			kind: "session" as const,
			workspaceId,
			workspaceDirectory: ledger.directory,
			sessionId: "actual-fixture-sdk",
		},
		signal: ledger.controller.signal,
		capabilities: ledger.ports,
	};
	try {
		expect(await runtime.operations["inquiry.read"].execute({ action: "status" }, context)).toMatchObject({
			state: "needs-binding",
		});
		await expect(
			runtime.operations["inquiry.write"].execute(
				{
					action: "bind",
					root: "binary",
					metadataRoot: "json",
					acknowledgeExistingData: false,
				},
				context,
			),
		).rejects.toThrow("explicit acknowledgment");
		expect(await ledger.readJson(inquiryBindingPath())).toEqual({
			kind: "missing",
			version: null,
		});
		expect(
			await runtime.operations["inquiry.write"].execute(
				{
					action: "bind",
					root: "binary",
					metadataRoot: "json",
					acknowledgeExistingData: true,
				},
				context,
			),
		).toMatchObject({ bound: true, existingData: true, projectId });
		expect(await readFile(join(ledger.binary, "ledger.sqlite"))).toEqual(ledger.initial);
	} finally {
		await runtime.dispose();
	}
});

it("refuses a second actual workspace binding to the same original directory within one application", async ({
	ledger,
}) => {
	const runtime = await createInquiryRuntimeWithEngine(
		{
			applicationId: "app",
			signal: ledger.controller.signal,
			resources: [],
			capabilities: ledger.ports,
			events: { changed() {} },
		},
		ledger.engine,
	);
	const context = {
		scope: {
			kind: "session" as const,
			workspaceId,
			workspaceDirectory: ledger.directory,
			sessionId: "actual-fixture-sdk",
		},
		signal: ledger.controller.signal,
		capabilities: ledger.ports,
	};
	try {
		await runtime.operations["inquiry.read"].execute({ action: "snapshot" }, context);
		ledger.activeWorkspace = "other-workspace";
		ledger.activeDirectory = join(ledger.directory, "other-workspace");
		await mkdir(ledger.activeDirectory);
		await expect(
			runtime.operations["inquiry.write"].execute(
				{
					action: "bind",
					root: "binary",
					metadataRoot: "json",
					acknowledgeExistingData: true,
				},
				context,
			),
		).rejects.toThrow("workspace binding");
		expect(await readFile(join(ledger.binary, "ledger.sqlite"))).toEqual(ledger.initial);
		expect((await ledger.state()).value.workspaceId).toBe(workspaceId);
		expect(ledger.binaryWrites).toBe(0);
	} finally {
		await runtime.dispose();
	}
});

it("requires explicit reconciliation when pending metadata committed but its cancelled caller never received the new version", async ({
	ledger,
}) => {
	const invocation = new AbortController();
	let losePendingReply = true;
	const actualPorts: PluginRuntimeCapabilities = {
		async call(name, input, signal) {
			const result = await ledger.ports.call(name, input, signal);
			if (
				name === "state.writeJson" &&
				losePendingReply &&
				(input as { value: { intent?: { status: string } } }).value.intent?.status === "pending"
			) {
				losePendingReply = false;
				invocation.abort(new Error("Caller cancelled after actual metadata commit"));
				throw invocation.signal.reason;
			}
			return result;
		},
	};
	const runtime = await createInquiryRuntimeWithEngine(
		{
			applicationId: "app",
			signal: ledger.controller.signal,
			resources: [],
			capabilities: actualPorts,
			events: { changed() {} },
		},
		ledger.engine,
	);
	const scope = {
		kind: "session" as const,
		workspaceId,
		workspaceDirectory: ledger.directory,
		sessionId: "actual-fixture-sdk",
	};
	const context = {
		scope,
		signal: ledger.controller.signal,
		capabilities: actualPorts,
	};
	try {
		await expect(
			runtime.operations["inquiry.write"].execute(
				{ action: "recordQuestion", record: question("cancelled-before-db") },
				{ ...context, signal: invocation.signal },
			),
		).rejects.toThrow("after actual metadata commit");
		expect((await ledger.state()).value.intent?.status).toBe("pending");
		expect(await readFile(join(ledger.binary, "ledger.sqlite"))).toEqual(ledger.initial);
		await expect(runtime.operations["inquiry.read"].execute({ action: "snapshot" }, context)).rejects.toThrow(
			"explicit reconciliation",
		);
		const writes = ledger.binaryWrites;
		expect(await runtime.operations["inquiry.write"].execute({ action: "reconcile" }, context)).toMatchObject(
			{ value: { state: "not-committed" } },
		);
		expect((await ledger.state()).value.intent?.status).toBe("not-committed");
		expect(ledger.binaryWrites).toBe(writes);
		expect(await runtime.operations["inquiry.read"].execute({ action: "snapshot" }, context)).toMatchObject({
			value: { questions: [{ id: "original" }] },
		});
	} finally {
		await runtime.dispose();
	}
});
