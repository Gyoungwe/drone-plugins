import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { discoveryHostLoader } from "../dist/host.mjs";
import { memoryServices } from "./memory-services.mjs";

const capabilities = {
	kind: "fixture",
	languages: ["python"],
	networkDisabled: true,
	writesOnlyToRunDirectory: true,
};
async function hostWithRunner(run, executionTimeoutMs = 1000) {
	const { services, journals } = memoryServices();
	services.authorize = async () => {};
	services.files.prepareDirectory = async () => {};
	services.runner = async () => ({ capabilities, run });
	const host = discoveryHostLoader.create({
		projectId: "test",
		projectRoot: "/tmp/discovery-lifecycle",
		services,
	});
	await host.createKernelSession({
		sessionId: "session",
		language: "python",
		runDirectory: "runs/session",
		dataClassification: "public",
		executionTimeoutMs,
	});
	return { host, journals };
}

test("close waits for aborted execution cleanup and late completion never revives ready", async () => {
	const entered = Promise.withResolvers();
	const cleanup = Promise.withResolvers();
	let aborted = false;
	const { host, journals } = await hostWithRunner(
		(request) =>
			new Promise((resolve) => {
				entered.resolve();
				request.signal.addEventListener(
					"abort",
					() => {
						aborted = true;
						void cleanup.promise.then(() =>
							resolve({
								exitCode: 0,
								durationMs: 1,
								producedBytes: 0,
								outputs: [],
							}),
						);
					},
					{ once: true },
				);
			}),
	);
	const execution = host.executeKernel({
		sessionId: "session",
		code: "bounded",
	});
	await entered.promise;
	let closed = false;
	const closing = host.closeKernelSession({ sessionId: "session" }).then(() => {
		closed = true;
	});
	let closedAgain = false;
	const closingAgain = host.closeKernelSession({ sessionId: "session" }).then(() => {
		closedAgain = true;
	});
	await setImmediate();
	assert.equal(aborted, true);
	assert.equal(closed, false);
	assert.equal(closedAgain, false);
	assert.notEqual((await host.getKernelSession({ sessionId: "session" })).status, "closed");
	cleanup.resolve();
	assert.equal((await execution).blockedReason, "cancelled");
	await Promise.all([closing, closingAgain]);
	assert.equal((await host.getKernelSession({ sessionId: "session" })).status, "closed");
	assert.equal(journals.get("sessions")[0].status, "closed");
	await host.dispose();
});

test("cleanup failure remains a failing execution, close and repeated dispose", async () => {
	const entered = Promise.withResolvers();
	const failure = Object.assign(new Error("owned container remains"), {
		code: "DISCOVERY_CLEANUP_FAILED",
	});
	const { host } = await hostWithRunner(
		(request) =>
			new Promise((_, reject) => {
				entered.resolve();
				request.signal.addEventListener("abort", () => reject(failure), {
					once: true,
				});
			}),
	);
	const execution = host.executeKernel({
		sessionId: "session",
		code: "bounded",
	});
	const rejected = assert.rejects(execution, {
		code: "DISCOVERY_CLEANUP_FAILED",
	});
	await entered.promise;
	await assert.rejects(host.closeKernelSession({ sessionId: "session" }), {
		code: "DISCOVERY_CLEANUP_FAILED",
	});
	await rejected;
	await assert.rejects(host.dispose(), /cleanup failed/);
	await assert.rejects(host.dispose(), /cleanup failed/);
});

test("timeout aborts the runner, waits for cleanup, then records a failed timeout", async () => {
	let aborted = false;
	const { host } = await hostWithRunner(
		(request) =>
			new Promise((_, reject) => {
				request.signal.addEventListener(
					"abort",
					() => {
						aborted = true;
						reject(request.signal.reason);
					},
					{ once: true },
				);
			}),
		20,
	);
	const execution = await host.executeKernel({
		sessionId: "session",
		code: "bounded",
	});
	assert.equal(aborted, true);
	assert.equal(execution.status, "failed");
	assert.equal(execution.blockedReason, "timeout");
	await host.closeKernelSession({ sessionId: "session" });
	await host.dispose();
});

test("ordinary execution failure remains failed while clean disposal can complete", async () => {
	const { host } = await hostWithRunner(async () => {
		throw new Error("execution failed after clean exit");
	});
	const execution = await host.executeKernel({
		sessionId: "session",
		code: "bounded",
	});
	assert.equal(execution.status, "failed");
	assert.equal(execution.blockedReason, "runner-failure");
	await host.dispose();
});

test("dispose waits for execution publication as well as the runner resource", async () => {
	const published = Promise.withResolvers();
	const release = Promise.withResolvers();
	const { services } = memoryServices();
	services.authorize = async () => {};
	services.files.prepareDirectory = async () => {};
	services.runner = async () => ({
		capabilities,
		run: async () => ({
			exitCode: 0,
			durationMs: 1,
			producedBytes: 0,
			outputs: [],
		}),
	});
	services.onExecution = async () => {
		published.resolve();
		await release.promise;
	};
	const host = discoveryHostLoader.create({
		projectId: "test",
		projectRoot: "/tmp/discovery-lifecycle",
		services,
	});
	await host.createKernelSession({
		sessionId: "session",
		language: "python",
		runDirectory: "runs/session",
		dataClassification: "public",
	});
	const execution = host.executeKernel({
		sessionId: "session",
		code: "bounded",
	});
	await published.promise;
	let disposed = false;
	const disposal = host.dispose().then(() => {
		disposed = true;
	});
	await setImmediate();
	assert.equal(disposed, false);
	release.resolve();
	await execution;
	await disposal;
});

test("a rejected creation journal never leaves a live logical kernel or timer", async () => {
	const { services, journals } = memoryServices();
	services.authorize = async () => {};
	services.runner = async () => ({
		capabilities,
		run: async () => ({ exitCode: 0, durationMs: 0, producedBytes: 0, outputs: [] }),
	});
	const original = services.journal;
	let fail = true;
	services.journal = (name) => {
		const journal = original(name);
		return name === "sessions"
			? {
					...journal,
					write: async (records) => {
						if (fail) {
							fail = false;
							throw new Error("actual journal write rejected");
						}
						await journal.write(records);
					},
				}
			: journal;
	};
	const host = discoveryHostLoader.create({
		projectId: "creation",
		projectRoot: "/tmp/discovery-creation",
		services,
	});
	const input = {
		sessionId: "new",
		language: "python",
		runDirectory: "runs/new",
		dataClassification: "public",
	};
	await assert.rejects(host.createKernelSession(input), /actual journal write rejected/);
	assert.deepEqual(await host.listKernelSessions(), []);
	assert.equal((await host.createKernelSession(input)).status, "ready");
	assert.equal(journals.get("sessions").length, 1);
	await host.dispose();
});
