import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import { afterEach, expect, it, vi } from "vitest";
import type { KnowledgePreviewReviewResult } from "../src/desktop/contract";
import { settings } from "../test/setup";
import { NativeKnowledgeModelReview } from "./NativeKnowledgeModelReview";
import { createKnowledgeRuntimeStore } from "./runtime-store";

afterEach(cleanup);
const preview: KnowledgePreviewReviewResult = {
	id: "candidate-a",
	title: "Candidate",
	path: "Wiki/Assay.md",
	project: "alpha",
	rationale: "Recorded evidence",
	bindingRevision: 7,
	proposalHash: "a".repeat(64),
	before: "Old claim",
	after: "Bounded claim",
	protectedText: "Human text",
	sources: [],
	targetChanged: false,
	canApply: true,
	scientificallyVerified: false,
};
async function fixture(model: NonNullable<PluginUiRuntimeClient["invoke"]>) {
	const invoke = vi.fn<PluginUiRuntimeClient["invoke"]>(async (operation, input, signal) => {
		if (operation === "overview")
			return {
				state: "bound",
				binding: { vaultId: "vault", revision: 7, label: "Vault" },
				project: "alpha",
				index: {
					revision: 1,
					coverage: "ready",
					noteCount: 1,
					pendingChanges: 0,
					lastReconciledAt: null,
				},
				recentNotes: [],
			};
		if (operation === "modelReviewInfo")
			return {
				selection: { provider: "configured", model: "reviewer", thinkingLevel: "off" },
				lastReview: null,
			};
		return model(operation, input, signal);
	});
	const store = createKnowledgeRuntimeStore({ invoke, subscribe: () => () => {} });
	const disconnect = store.connect();
	await waitFor(() => expect(store.getSnapshot().overview?.binding?.revision).toBe(7));
	return { store, invoke, disconnect };
}

it("requires cost consent, sends the binding/hash and cancels only its real bound invocation signal", async () => {
	let signal!: AbortSignal;
	const value = await fixture(async (_operation, _input, current) => {
		signal = current!;
		return new Promise((_resolve, reject) =>
			signal.addEventListener("abort", () => reject(new Error("review canceled")), { once: true }),
		);
	});
	const busy = vi.fn();
	const view = render(
		<NativeKnowledgeModelReview
			store={value.store}
			preview={preview}
			disabled={false}
			onBusy={busy}
			onApplied={vi.fn()}
		/>,
	);
	await waitFor(() => expect(screen.getByText("configured/reviewer · off")).toBeTruthy());
	const start = screen.getByRole("button", { name: "开始审核" });
	expect((start as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByRole("checkbox", { name: /同意将当前候选/ }));
	fireEvent.click(start);
	await waitFor(() => expect(signal).toBeDefined());
	expect(value.invoke).toHaveBeenLastCalledWith(
		"modelReview",
		{
			id: preview.id,
			expectedProposalHash: preview.proposalHash,
			revision: 7,
			acknowledged: true,
			autoApply: false,
		},
		signal,
	);
	fireEvent.click(screen.getByRole("button", { name: "取消审核" }));
	await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("review canceled"));
	expect(signal.aborted).toBe(true);
	expect(busy).toHaveBeenLastCalledWith(false);
	view.unmount();
	value.disconnect();
});

it("uses the configured review profile and presents an explicit auto-apply receipt without scientific certification", async () => {
	settings.setState({
		modelPrefs: { subagentModels: { "knowledge-wiki-reviewer": "configured/reviewer" } },
	});
	const report = {
		auditId: "audit-1",
		verdict: "approve",
		summary: "Bounded evidence",
		applied: true,
		scientificallyVerified: false,
		humanReviewed: false,
		usage: { inputTokens: null, outputTokens: null, cost: null },
	};
	const value = await fixture(async () => report);
	const onApplied = vi.fn();
	render(
		<NativeKnowledgeModelReview
			store={value.store}
			preview={preview}
			disabled={false}
			onBusy={vi.fn()}
			onApplied={onApplied}
		/>,
	);
	await waitFor(() => expect(screen.getByText("configured/reviewer · off")).toBeTruthy());
	fireEvent.click(screen.getByRole("checkbox", { name: /同意将当前候选/ }));
	fireEvent.click(screen.getByRole("checkbox", { name: /仅在此候选全部检查通过/ }));
	fireEvent.click(screen.getByRole("button", { name: "开始审核" }));
	await waitFor(() => expect(onApplied).toHaveBeenCalledWith(report));
	expect(value.invoke).toHaveBeenLastCalledWith(
		"modelReview",
		expect.objectContaining({ revision: 7, profile: "knowledge-wiki-reviewer", autoApply: true }),
		expect.any(AbortSignal),
	);
	expect(screen.getByTestId("native-model-review-result").textContent).toContain(
		"模型意见不等于人工审核或科学认证",
	);
	expect(screen.getByTestId("native-model-review-result").textContent).toContain("未知");
	value.disconnect();
});
