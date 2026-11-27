import type { ArtifactContributionProps } from "@gyoungwe/plugin-api/ui";
import { act, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { copy } from "../../ui/copy.js";
import { InquiryArtifactStatus } from "../../ui/index.js";
import { uiFixture } from "./setup.js";

function props(overrides: Partial<ArtifactContributionProps> = {}): ArtifactContributionProps {
	return {
		surface: "evidence.overview",
		artifactId: null,
		analysisId: null,
		capabilityId: null,
		sessionId: "session",
		workspaceId: "workspace",
		renderDefault: vi.fn(() => null),
		...overrides,
	};
}

test("shows a bound workspace and a read-only pointer to Inquiry", async () => {
	const input = props();
	uiFixture.invoke.mockResolvedValue({ state: "bound", unavailable: ["workspace-promotion-file-port"] });
	render(<InquiryArtifactStatus {...input} />);
	const status = await screen.findByRole("status");
	expect(status.textContent).toContain("Original ledger is bound.");
	expect(status.textContent).toContain("Workspace promotion is not connected.");
	expect(status.textContent).toContain("See the Inquiry panel.");
	expect(status.textContent).not.toContain("Re-run executor is not connected.");
	expect(uiFixture.invoke).toHaveBeenCalledExactlyOnceWith(
		"inquiry.read",
		{ action: "status" },
		expect.any(AbortSignal),
	);
	expect(screen.queryAllByRole("button")).toEqual([]);
	expect(screen.queryAllByRole("link")).toEqual([]);
	expect(input.renderDefault).not.toHaveBeenCalled();
});

test.each([
	["select-workspace", "Select an actual workspace session."],
	["needs-binding", "Original ledger is not bound."],
	["needs-recovery", "A pending write needs reconciliation."],
])("shows the %s state on the Evidence pane", async (state, message) => {
	uiFixture.invoke.mockResolvedValue({ state });
	render(<InquiryArtifactStatus {...props({ surface: "evidence.pane" })} />);
	expect((await screen.findByRole("status")).textContent).toContain(message);
});

test("shows when the rerun executor is unavailable", async () => {
	uiFixture.language = "zh";
	uiFixture.invoke.mockResolvedValue({ state: "bound", unavailable: ["rerun-executor"] });
	render(<InquiryArtifactStatus {...props()} />);
	expect((await screen.findByRole("status")).textContent).toContain("重跑执行器未接通。");
});

test("does not read or render a card without an ID", () => {
	const view = render(<InquiryArtifactStatus {...props({ surface: "artifacts.card" })} />);
	expect(view.container.textContent).toBe("");
	expect(uiFixture.invoke).not.toHaveBeenCalled();
});

test("does not render a card missing from the Inquiry ledger", async () => {
	uiFixture.invoke.mockResolvedValue({ value: null });
	const input = props({ surface: "artifacts.card", artifactId: "artifact" });
	const view = await act(async () => render(<InquiryArtifactStatus {...input} />));
	expect(view.container.textContent).toBe("");
	expect(uiFixture.invoke).toHaveBeenCalledWith(
		"inquiry.read",
		{ action: "artifactProvenance", id: "artifact" },
		expect.any(AbortSignal),
	);
	expect(uiFixture.invoke.mock.calls.every(([operation]) => operation === "inquiry.read")).toBe(true);
});

test("shows status on a card found in the Inquiry ledger", async () => {
	uiFixture.invoke.mockImplementation(async (operation, input) => {
		if (operation === "inquiry.read" && input && typeof input === "object" && "action" in input) {
			if (input.action === "artifactProvenance") return { value: { artifact: { id: "artifact" } } };
			if (input.action === "status") return { state: "bound" };
		}
		throw new Error("Unexpected invocation");
	});
	const input = props({ surface: "artifacts.card", artifactId: "artifact" });
	render(<InquiryArtifactStatus {...input} />);
	expect((await screen.findByRole("status")).textContent).toContain("See the Inquiry panel.");
	expect(screen.queryAllByRole("button")).toEqual([]);
	expect(screen.queryAllByRole("link")).toEqual([]);
	expect(input.renderDefault).not.toHaveBeenCalled();
});

test("shows a fallback when the read rejects", async () => {
	uiFixture.invoke.mockRejectedValue(new Error("Read failed"));
	render(<InquiryArtifactStatus {...props()} />);
	await screen.findByText("Inquiry status is temporarily unavailable.");
	expect(screen.queryByText("Read failed")).toBeNull();
});

test("shows a fallback when the runtime hook is unavailable", () => {
	uiFixture.usePluginRuntime.mockImplementation(() => {
		throw new Error("Runtime unavailable");
	});
	render(<InquiryArtifactStatus {...props()} />);
	expect(screen.getByText("Inquiry status is temporarily unavailable.")).toBeDefined();
	expect(uiFixture.invoke).not.toHaveBeenCalled();
});

test("clears status on session change and aborts outstanding reads", async () => {
	let resolveStale: (result: unknown) => void;
	const stale = new Promise((resolve) => {
		resolveStale = resolve;
	});
	uiFixture.invoke
		.mockResolvedValueOnce({ state: "bound" })
		.mockReturnValueOnce(stale)
		.mockImplementationOnce(
			(_operation, _input, signal) =>
				new Promise((_resolve, reject) => {
					signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
				}),
		);
	const input = props();
	const view = render(<InquiryArtifactStatus {...input} />);
	await screen.findByText(/Original ledger is bound/);
	view.rerender(<InquiryArtifactStatus {...input} sessionId="other-session" />);
	expect(screen.queryByRole("status")).toBeNull();
	const staleSignal = uiFixture.invoke.mock.calls[1]?.[2];
	view.rerender(<InquiryArtifactStatus {...input} sessionId="other-session" workspaceId="other-workspace" />);
	expect(staleSignal?.aborted).toBe(true);
	await act(async () => resolveStale({ state: "needs-recovery" }));
	expect(screen.queryByRole("status")).toBeNull();
	const latestSignal = uiFixture.invoke.mock.calls[2]?.[2];
	view.unmount();
	expect(latestSignal?.aborted).toBe(true);
});

test("copy keys match", () => {
	expect(Object.keys(copy.en).sort()).toEqual(Object.keys(copy.zh).sort());
});
