import { afterEach, describe, expect, it } from "vitest";
import { flowFor, subscribeKnowledgeUi } from "../src/core/ui-state.js";

describe("knowledge UI module boundary", () => {
	it("receives a flow event forwarded by a second bundle", () => {
		const sessionId = `cross-bundle-${Date.now()}`;
		const received: unknown[] = [];
		const unsubscribe = subscribeKnowledgeUi((event: unknown) => received.push(event));
		try {
			Reflect.apply(process.emit, process, [
				"drone:knowledge-ui/v1",
				{
					event: { kind: "flow", sequence: 7, flow: { sessionId, phase: "searching" } },
					origin: {},
				},
			]);
			expect(received).toHaveLength(1);
			expect(flowFor(sessionId)).toMatchObject({ sessionId, phase: "searching" });
		} finally {
			unsubscribe();
		}
	});
});
