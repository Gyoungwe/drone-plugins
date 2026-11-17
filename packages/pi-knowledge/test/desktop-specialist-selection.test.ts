import type {
	PluginModelJson,
	PluginModelSelection,
	PluginModelToolStepInput,
	PluginModelToolStepResult,
	PluginRuntimeCapabilities,
} from "@gyoungwe/plugin-api/runtime";
import { Type } from "typebox";
import { expect, it, vi } from "vitest";
import type { SpecialistRequest } from "../src/core/specialist-model-loop.js";
import { createBrokerKnowledgeSpecialist } from "../src/desktop/specialist-model.js";
import { withAgentSlotFake } from "./helpers/agent-slot-fake.js";

const selection: PluginModelSelection = Object.freeze({
	provider: "host-provider",
	model: "host-model",
	thinkingLevel: "low",
	optionalProfile: "knowledge-navigator",
	inheritedThinking: "nearest-supported",
});
const answer = { summary: "Synthetic result", source_paths: [], cautions: [] };

function specialistRequest(): SpecialistRequest {
	return {
		role: "navigator",
		task: "Find synthetic evidence",
		packet: "Synthetic source packet",
		capabilities: [],
		check: vi.fn(async () => undefined),
		progress: vi.fn(),
	};
}

function toolStepResult(name: string, args: PluginModelJson): PluginModelToolStepResult {
	return {
		selection,
		reply: {
			role: "assistant",
			stopReason: "toolUse",
			timestamp: 0,
			content: [{ type: "toolCall", id: `call-${name}`, name, arguments: args }],
		},
		usage: {
			inputTokens: null,
			outputTokens: null,
			cacheReadTokens: null,
			cacheWriteTokens: null,
			reasoningTokens: null,
			totalTokens: null,
			cost: null,
			reportedFields: [],
		},
	};
}

it("opts specialists into the host inherited-thinking fallback with the exact selection request", async () => {
	const call = vi
		.fn<PluginRuntimeCapabilities["call"]>()
		.mockResolvedValueOnce(selection)
		.mockResolvedValueOnce(toolStepResult("knowledge_submit", answer));

	await createBrokerKnowledgeSpecialist(withAgentSlotFake(call))(specialistRequest());

	expect(call.mock.calls.filter(([name]) => name === "model.selection")).toEqual([
		["model.selection", { optionalProfile: "knowledge-navigator", inheritedThinking: "nearest-supported" }],
	]);
});

it("passes the host selection and adjusted thinking unchanged to every tool step", async () => {
	const call = vi
		.fn<PluginRuntimeCapabilities["call"]>()
		.mockResolvedValueOnce(selection)
		.mockResolvedValueOnce(toolStepResult("knowledge_read", { path: "synthetic.md" }))
		.mockResolvedValueOnce(toolStepResult("knowledge_submit", answer));
	const request = specialistRequest();
	const read = vi.fn(async () => ({ text: "Synthetic evidence" }));
	request.capabilities.push({
		name: "knowledge_read",
		description: "Read synthetic evidence",
		parameters: Type.Object({ path: Type.String() }),
		execute: read,
	});

	const result = await createBrokerKnowledgeSpecialist(withAgentSlotFake(call))(request);

	expect(read).toHaveBeenCalledOnce();
	const steps = call.mock.calls.filter(([name]) => name === "model.toolStep");
	expect(steps).toHaveLength(2);
	for (const [, input] of steps) {
		expect((input as PluginModelToolStepInput).selection).toBe(selection);
	}
	expect(result).toMatchObject({
		data: answer,
		model: "host-provider/host-model",
		thinkingLevel: "low",
	});
});

it("propagates a host selection rejection without running any tool step", async () => {
	const rejection = new Error("Configured specialist thinking is unsupported");
	const call = vi.fn<PluginRuntimeCapabilities["call"]>().mockRejectedValue(rejection);

	await expect(createBrokerKnowledgeSpecialist(withAgentSlotFake(call))(specialistRequest())).rejects.toBe(
		rejection,
	);

	expect(call.mock.calls.map(([name]) => name)).toEqual(["model.selection"]);
	expect(call.mock.calls.filter(([name]) => name === "model.toolStep")).toHaveLength(0);
});
