import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createTopicMemory } from "../src/core/topic-memory.js";

it("keeps incomparable observations unresolved across reopening instead of using summary similarity", async () => {
	const directory = await mkdtemp(join(tmpdir(), "topic-science-"));
	const options = { binding: { vaultId: "a".repeat(24) }, project: "science", directory };
	const previous = {
		claim: "X increases expression",
		subject: "X",
		predicate: "expression",
		value: "increases expression",
		organism: "mouse",
		tissue: "liver",
		stage: "adult",
		method: "RNA-seq",
		direction: "increase",
		sourcePath: "Library/Papers/one.md",
		sourceHash: "1".repeat(64),
		relation: "observation",
		limitations: "This observation supplies no clinical efficacy or causal evidence.",
	};
	try {
		const memory = createTopicMemory(options);
		await memory.record(
			{ topicId: "expression", title: "Expression", summary: "One short phrase", claims: [previous] },
			undefined,
		);
		const incoming = {
			...previous,
			claim: "X decreases expression",
			value: "decreases expression",
			direction: "decrease",
			organism: undefined,
			sourcePath: "Library/Papers/two.md",
			sourceHash: "2".repeat(64),
		};
		const result = await memory.record(
			{
				topicId: "expression",
				title: "Expression",
				summary: "Entirely different terminology and vocabulary",
				claims: [incoming],
			},
			undefined,
		);
		expect(result.classification).toBe("additional");
		const reopened = createTopicMemory(options);
		const topic = (await reopened.get("expression")).matches[0];
		expect(topic.claims).toHaveLength(2);
		expect(topic.claims[0].limitations).toBe(previous.limitations);
		expect(topic.conflicts[0]).toMatchObject({
			relation: "unresolved",
			comparisonVersion: 2,
			previousSourceHash: previous.sourceHash,
			incomingSourceHash: incoming.sourceHash,
			missingConditions: ["organism"],
		});
		expect((await reopened.list()).revision).toBe(result.revision);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
