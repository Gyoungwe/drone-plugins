import { expect, it } from "vitest";
import { createManagedKnowledgePublication } from "../src/core/publication.js";

it("registers one authoritative finalizer and runs the existing publication algorithm once without an ordinary final-message hook", async () => {
	const publication = createManagedKnowledgePublication(
		{ async publicationKnowledgeFlow() {}, updateKnowledgeFlow() {} },
		{ readReviewMode: async () => "strict" },
		new AbortController().signal,
	);
	const hooks = new Map<string, any>();
	const turn = publication.registerAnswerPublication({ on: (name: string, handler: any) => hooks.set(name, handler) }, { getCurrent: () => null });
	expect(hooks.has("context")).toBe(true);
	expect(hooks.has("message_end")).toBe(false);
	turn.begin(false);
	const event = { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "ordinary content" }], stopReason: "stop", timestamp: 1 } };
	const checked = await publication.projection.finalize(event, {
		scope: { kind: "session", sessionId: "actual", workspaceId: "workspace", workspaceDirectory: "/workspace" },
		signal: new AbortController().signal,
		capabilities: { async call() { throw new Error("No IO requested by this publication"); } },
	});
	expect(checked.message.knowledgePublication.status).toBe("unconfigured");
	expect(publication.projection.event(checked).message.content).toEqual(event.message.content);
	const copied = structuredClone(checked);
	expect(publication.projection.event(copied).message.knowledgePublication.status).toBe("blocked");
});

it("allows genuine historical object identity for display without minting a live proof, and rejects identical strangers", () => {
	const publication = createManagedKnowledgePublication(
		{ async publicationKnowledgeFlow() {}, updateKnowledgeFlow() {} },
		{ readReviewMode: async () => "strict" },
		new AbortController().signal,
	);
	const history = { role: "assistant", content: [{ type: "text", text: "historical unverified" }], timestamp: 1 };
	const copy = structuredClone(history);
	expect(publication.projection.snapshot([history], [history])[0]).toBe(history);
	expect(publication.projection.snapshot([copy], [history])[0].content).not.toEqual(copy.content);
	const original = structuredClone(history.content);
	expect(publication.projection.event({ type: "message_end", message: history }).message.content).not.toEqual(original);
});
