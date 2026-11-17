import { Type } from "typebox";
import { afterEach, expect, it, vi } from "vitest";
import type { SpecialistResult } from "../src/core/specialist-model-loop.js";
import {
	answer,
	deferred,
	ownerFixture,
	reply,
	reviewerFixture,
	selection,
	sourcePath,
	task,
} from "./helpers/specialist-model-fixture.js";

const closers: (() => void | Promise<void>)[] = [];
afterEach(async () => {
	for (const close of closers.splice(0)) await close();
});

async function owner(settings: Record<string, number> = {}) {
	const fixture = await ownerFixture(settings);
	closers.push(fixture.close);
	return fixture;
}

function reviewer() {
	const fixture = reviewerFixture();
	closers.push(fixture.close);
	return fixture;
}

it.each([
	["unset role model", selection],
	[
		"configured role model",
		{ provider: "synthetic-role-provider", model: "role-model", thinkingLevel: "low" },
	],
])(
	"R01 uses optionalProfile and preserves the host selection for %s through the native tool",
	async (_label, selected) => {
		const f = await owner();
		f.model.select.mockResolvedValue(selected);
		f.model.step
			.mockResolvedValueOnce({ ...reply("knowledge_read", { path: sourcePath }), selection: selected })
			.mockResolvedValueOnce({
				...reply("knowledge_search", { query: "synthetic evidence" }),
				selection: selected,
			})
			.mockResolvedValueOnce({ ...reply("knowledge_submit", answer), selection: selected });

		const result = await f.execute("navigator");

		expect(f.call.mock.calls.filter(([name]) => name === "model.selection")).toEqual([
			["model.selection", { optionalProfile: "knowledge-navigator", inheritedThinking: "nearest-supported" }],
		]);
		expect(f.model.step).toHaveBeenCalledTimes(3);
		for (const [input] of f.model.step.mock.calls) expect(input.selection).toEqual(selected);
		expect(f.sourceReads()).toHaveLength(1);
		expect(f.evidenceSearches()).toHaveLength(1);
		expect(result).toMatchObject({
			status: "completed",
			summary: answer.summary,
			refs: [{ path: sourcePath }],
		});
	},
);

it("R01 surfaces a configured unavailable model without another selection or provider switch", async () => {
	const f = await owner();
	f.model.select.mockRejectedValue(new Error("Synthetic configured model is unavailable"));

	const result = await f.execute();

	expect(f.call.mock.calls.filter(([name]) => name.startsWith("model."))).toEqual([
		[
			"model.selection",
			{ optionalProfile: "knowledge-evidence-curator", inheritedThinking: "nearest-supported" },
		],
	]);
	expect(f.model.step).not.toHaveBeenCalled();
	expect(f.sourceReads()).toHaveLength(1);
	expect(result).toMatchObject({ status: "failed", reason: "Synthetic configured model is unavailable" });
	expect(result).not.toHaveProperty("summary");
});

it("R04 advertises only submission for the registered protected reviewer and returns its validated answer", async () => {
	const f = reviewer();
	const review = {
		...answer,
		verdict: "approve",
		checks: {
			evidenceSupportsChanges: true,
			scopeAndUncertaintyPreserved: true,
			noUnresolvedContradictions: true,
			humanContentPreserved: true,
			noInstructionInjection: true,
		},
	};
	f.model.step.mockResolvedValueOnce(reply("knowledge_submit", review));

	const result: SpecialistResult = await f.run();

	expect(f.call.mock.calls.map(([name]) => name)).toEqual(["model.selection", "model.toolStep"]);
	expect(f.call.mock.calls[0][1]).toEqual({
		optionalProfile: "knowledge-wiki-reviewer",
		inheritedThinking: "nearest-supported",
	});
	expect(f.model.step.mock.calls[0][0].tools.map((tool) => tool.name)).toEqual(["knowledge_submit"]);
	expect(result).toMatchObject({ data: review, model: `${selection.provider}/${selection.model}` });
});

it.each(["knowledge_read", "knowledge_approve"])(
	"R04 rejects a model-requested %s in the protected reviewer",
	async (name) => {
		const f = reviewer();
		f.model.step.mockResolvedValueOnce(reply(name, { path: sourcePath }));

		await expect(f.run()).rejects.toThrow("Specialist requested a forbidden capability");

		expect(f.call.mock.calls.map(([capability]) => capability)).toEqual([
			"model.selection",
			"model.toolStep",
		]);
		expect(f.model.step).toHaveBeenCalledOnce();
		expect(f.model.step.mock.calls[0][0].tools.map((tool) => tool.name)).toEqual(["knowledge_submit"]);
		expect(f.request.progress).not.toHaveBeenCalledWith({ action: name });
	},
);

it("R04 refuses an injected reviewer read implementation before selection or execution", async () => {
	const f = reviewer();
	const execute = vi.fn(async () => ({ text: "Forbidden synthetic read" }));
	f.request.capabilities.push({
		name: "knowledge_read",
		description: "Attempt to widen reviewer permissions",
		parameters: Type.Object({ path: Type.String() }),
		execute,
	});

	await expect(f.run()).rejects.toThrow("Knowledge specialist capability is not permitted");

	expect(execute).not.toHaveBeenCalled();
	expect(f.call).not.toHaveBeenCalled();
});

it("R09 stops at a denied second tool step and returns a visible native failure", async () => {
	const f = await owner();
	f.model.step
		.mockResolvedValueOnce(reply("knowledge_read", { path: sourcePath }))
		.mockRejectedValueOnce(new Error("Synthetic model.toolStep approval denied"))
		.mockResolvedValueOnce(reply("knowledge_submit", answer));

	const result = await f.execute();

	expect(f.call.mock.calls.filter(([name]) => name === "model.toolStep")).toHaveLength(2);
	expect(f.model.select).toHaveBeenCalledOnce();
	expect(f.sourceReads()).toHaveLength(2);
	expect(f.evidenceSearches()).toHaveLength(0);
	expect(f.model.step.mock.calls[1][0].messages.at(-1)).toMatchObject({
		role: "toolResult",
		toolName: "knowledge_read",
		isError: false,
	});
	expect(result).toMatchObject({ status: "failed", reason: "Synthetic model.toolStep approval denied" });
	expect(result).not.toHaveProperty("summary");
	expect(result).not.toHaveProperty("refs");
});

it("R10 sends only fresh task messages and private tool replies without parent history fields", async () => {
	const f = await owner();
	const parent = structuredClone(f.parentHistory);
	f.model.step
		.mockResolvedValueOnce(reply("knowledge_read", { path: sourcePath }))
		.mockResolvedValueOnce(reply("knowledge_submit", answer));

	const result = await f.execute();

	expect(f.model.step).toHaveBeenCalledTimes(2);
	const [first, second] = f.model.step.mock.calls.map(([input]) => input);
	expect(Object.keys(first).sort()).toEqual(["maxTokens", "messages", "selection", "systemPrompt", "tools"]);
	expect(first.messages).toEqual([
		{
			role: "user",
			timestamp: expect.any(Number),
			content: [{ type: "text", text: expect.any(String) }],
		},
	]);
	expect(first.messages[0].content[0]).toMatchObject({
		text: expect.stringContaining(JSON.stringify(task)),
	});
	const initial = first.messages[0].content[0] as { type: "text"; text: string };
	expect(JSON.parse(initial.text)).toEqual({ task, sourceData: expect.any(String) });
	expect(second.messages.map((message) => message.role)).toEqual(["user", "assistant", "toolResult"]);
	expect(second.messages[0]).toEqual(first.messages[0]);
	expect(JSON.stringify(f.model.step.mock.calls)).not.toContain("SYNTHETIC_PARENT_HISTORY_ONLY");
	expect(JSON.stringify(f.model.step.mock.calls)).not.toContain("parentHistory");
	expect(f.parentHistory).toEqual(parent);
	expect(f.context.sessionManager.getBranch()).toEqual(parent);
	expect(result).toMatchObject({ status: "completed", summary: answer.summary });
	expect(result).not.toHaveProperty("messages");
});

it("R08 charges observed usage from each step into the completed owner's budget", async () => {
	const f = await owner({ maxTokensPerTurn: 100 });
	f.model.step
		.mockResolvedValueOnce(reply("knowledge_read", { path: sourcePath }, { totalTokens: 40 }))
		.mockResolvedValueOnce(reply("knowledge_submit", answer, { totalTokens: 30 }));

	const result = await f.execute();

	expect(f.model.step).toHaveBeenCalledTimes(2);
	expect(f.sourceReads()).toHaveLength(2);
	expect(result).toMatchObject({
		status: "completed",
		usageReported: true,
		budget: { turnTokens: 70, sessionTokens: 70, toolOperations: 2, maxTokensPerTurn: 100 },
	});
});

it.each(["maxTokensPerTurn", "maxTokensPerSession"])(
	"R08 charges step N before N+1 and stops on %s exhaustion",
	async (limit) => {
		const f = await owner({ [limit]: 100 });
		f.model.step
			.mockResolvedValueOnce(reply("knowledge_read", { path: sourcePath }, { totalTokens: 60 }))
			.mockResolvedValueOnce(reply("knowledge_read", { path: sourcePath }, { totalTokens: 50 }))
			.mockResolvedValueOnce(reply("knowledge_submit", answer));

		const result = await f.execute();

		expect(f.model.step).toHaveBeenCalledTimes(2);
		expect(f.model.step.mock.calls[1][0].messages.at(-1)).toMatchObject({
			role: "toolResult",
			toolName: "knowledge_read",
		});
		expect(f.sourceReads()).toHaveLength(2);
		expect(result).toMatchObject({ status: "failed", reason: "Specialist token budget exhausted" });
		expect(result).not.toHaveProperty("summary");
	},
);

it("R08 stops tool execution and later model spend at the configured owner tool budget", async () => {
	const f = await owner({ maxToolOperations: 2 });
	f.model.step
		.mockResolvedValueOnce(reply("knowledge_read", { path: sourcePath }))
		.mockResolvedValueOnce(reply("knowledge_read", { path: sourcePath }))
		.mockResolvedValueOnce(reply("knowledge_submit", answer));

	const result = await f.execute();

	expect(f.model.step).toHaveBeenCalledTimes(2);
	// Source preparation and the first model read consume the two owner operations.
	expect(f.sourceReads()).toHaveLength(2);
	expect(result).toMatchObject({ status: "failed", reason: "Specialist read budget exhausted" });
	expect(result).not.toHaveProperty("refs");
});

it.each(["maxTokensPerTurn", "maxTokensPerSession"])(
	"R08 blocks step two and the first requested tool when step one exceeds %s",
	async (limit) => {
		const f = await owner({ [limit]: 100 });
		f.model.step
			.mockResolvedValueOnce(reply("knowledge_read", { path: sourcePath }, { totalTokens: 101 }))
			.mockResolvedValueOnce(reply("knowledge_submit", answer));

		const result = await f.execute();

		expect(f.model.step).toHaveBeenCalledOnce();
		expect(f.sourceReads()).toHaveLength(1);
		expect(result).toMatchObject({ status: "failed", reason: "Specialist token budget exhausted" });
		expect(result).not.toHaveProperty("summary");
	},
);

it("R19 aborts replacement work and drops a late valid reply without restoring the old handoff", async () => {
	const f = await owner();
	await f.begin("Compare synthetic knowledge evidence");
	const entered = deferred<void>();
	const late = deferred<ReturnType<typeof reply>>();
	f.model.step
		.mockResolvedValueOnce(reply("knowledge_search", { query: "synthetic evidence" }))
		.mockResolvedValueOnce(reply("knowledge_read", { path: sourcePath }))
		.mockImplementationOnce(async () => {
			entered.resolve();
			return late.promise;
		})
		.mockResolvedValueOnce(reply("knowledge_search", { query: "replacement evidence" }))
		.mockResolvedValueOnce(reply("knowledge_read", { path: sourcePath }))
		.mockResolvedValueOnce(reply("knowledge_submit", { ...answer, summary: "Replacement finding" }));
	const old = f.emit("context", {
		messages: f.parentHistory.map((entry) => (entry.type === "message" ? entry.message : entry)),
	});
	try {
		await Promise.race([
			entered.promise,
			old.then(() => {
				throw new Error("Old orientation ended before the gated reply");
			}),
		]);
		const oldSignal = f.model.step.mock.calls[2][1];
		expect(oldSignal?.aborted).toBe(false);
		await f.begin("Compare replacement knowledge evidence");
		expect(oldSignal?.aborted).toBe(true);
	} finally {
		late.resolve(reply("knowledge_submit", { ...answer, summary: "OLD_HANDOFF_MUST_BE_DROPPED" }));
	}
	const oldResult = await old;
	expect(f.model.step).toHaveBeenCalledTimes(3);
	expect(f.sourceReads()).toHaveLength(1);
	expect(JSON.stringify(oldResult)).not.toContain("drone-knowledge-specialists");
	expect(JSON.stringify(oldResult)).not.toContain("OLD_HANDOFF_MUST_BE_DROPPED");
	const freshResult = await f.emit("context", {
		messages: f.parentHistory.map((entry) => (entry.type === "message" ? entry.message : entry)),
	});
	expect(f.model.step).toHaveBeenCalledTimes(6);
	expect(f.sourceReads()).toHaveLength(2);
	expect(f.evidenceSearches()).toHaveLength(2);
	expect(f.model.step.mock.calls[3][1]?.aborted).toBe(false);
	expect(JSON.stringify(freshResult)).toContain("Replacement finding");
	expect(JSON.stringify(freshResult)).not.toContain("OLD_HANDOFF_MUST_BE_DROPPED");
});
