import { expect, it } from "vitest";
import { runRuntimeExclusive } from "../src/core/runtime-host.js";

function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => { release = resolve; });
	return { promise, release };
}

it("serializes the same namespace/key while independent namespaces can make progress", async () => {
	const hold = gate();
	const started = gate();
	const visits: string[] = [];
	const first = runRuntimeExclusive("review", "same-path", async () => {
		visits.push("first");
		started.release();
		await hold.promise;
		visits.push("released");
	});
	await started.promise;
	const second = runRuntimeExclusive("review", "same-path", async () => { visits.push("second"); });
	const independent = runRuntimeExclusive("semantic", "same-path", async () => { visits.push("independent"); });
	await Promise.resolve();
	try {
		expect(visits).toEqual(["first", "independent"]);
	} finally {
		hold.release();
		await Promise.all([first, second, independent]);
	}
	expect(visits).toEqual(["first", "independent", "released", "second"]);
});

it("a failed operation releases its queue for the next operation", async () => {
	const failed = runRuntimeExclusive("review", "failed-path", async () => { throw new Error("write failed"); });
	const next = runRuntimeExclusive("review", "failed-path", async () => "next write");
	await expect(failed).rejects.toThrow("write failed");
	await expect(next).resolves.toBe("next write");
	await expect(runRuntimeExclusive("review", "failed-path", async () => "new queue")).resolves.toBe("new queue");
});
