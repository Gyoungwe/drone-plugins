import type { PluginRuntimeContext } from "@gyoungwe/plugin-api/runtime";
import { expect, vi } from "vitest";
import createDesktopRuntime from "../../src/desktop/runtime.js";
import { withAgentSlotFake } from "./agent-slot-fake.js";
import { verdictFixture } from "./model-review-verdict-fixture.js";

type VerdictFixture = Awaited<ReturnType<typeof verdictFixture>>;

async function startOwner(base: VerdictFixture) {
	const capabilities = withAgentSlotFake(async (name, input) => {
		if (name.startsWith("state.")) return base.state.call(name, input);
		if (name.startsWith("model.") || name === "session.inspect") return base.model.call(name, input);
		if (name === "resource.create") return { handle: "synthetic-error-index" };
		if (name === "resource.invoke") {
			const args = input as { handle: string; operation: string };
			expect(args.handle).toBe("synthetic-error-index");
			expect(["status", "changed"]).toContain(args.operation);
			return { revision: 1 };
		}
		return base.files.call(name, input);
	});
	const controller = new AbortController();
	const runtime = await createDesktopRuntime({
		applicationId: "model-review-errors-test",
		signal: controller.signal,
		resources: [
			{ kind: "state", handle: "approved-state", access: "read-write" },
			{ kind: "files", handle: "approved-vault", access: "read-write" },
		],
		capabilities,
		events: { changed: vi.fn() },
		resourcesLifecycle: { dispose: async () => undefined },
	});
	const caller: PluginRuntimeContext = {
		scope: {
			kind: "session",
			sessionId: "synthetic-error-session",
			workspaceId: "synthetic-project",
			workspaceDirectory: "/synthetic-workspace",
		},
		signal: controller.signal,
		capabilities,
	};
	return { runtime, caller, controller };
}

export async function errorFixture() {
	// The shared fixture keeps its caller signal private; reuse its brokers with a cancellable owner.
	const base = await verdictFixture();
	const stateCall = vi.fn(base.state.call);
	const filesCall = vi.fn(base.files.call);
	base.state.call = stateCall;
	base.files.call = filesCall;
	const { runtime, caller, controller } = await startOwner(base);
	return {
		...base,
		stateCall,
		filesCall,
		review: (signal = controller.signal) =>
			runtime.operations.modelReview.execute(base.input, { ...caller, signal }),
		info: () => runtime.operations.modelReviewInfo.execute(base.input, caller),
		async dispose() {
			controller.abort();
			await runtime.dispose();
			await base.dispose();
		},
	};
}
