import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeKnowledgeSemanticSettings } from "./NativeKnowledgeSemanticSettings";

const settings = {
	version: 1 as const,
	revision: 4,
	updatedAt: "2026-10-26T00:00:00.000Z",
	enabled: false,
	provider: "none" as const,
	baseUrl: "",
	model: "",
	credentialEnv: "",
	remoteConsent: false,
	timeoutMs: 10_000,
	chunkChars: 1200,
	minSimilarity: 0.45,
};
const semantic = {
	binding: { vaultId: "vault", revision: 7, label: "Library" },
	settings,
	canWriteState: true,
	providerExecution: "unavailable" as const,
};

afterEach(cleanup);

it("reads semantic settings through the runtime and saves with binding and settings revisions", async () => {
	const runtime = {
		invoke: vi.fn(async (operation: string) =>
			operation === "semanticSettings" ? semantic : semantic,
		),
		subscribe: vi.fn(() => () => {}),
	};
	render(
		<NativeKnowledgeSemanticSettings
			client={runtime}
			observationRevision={1}
			refreshing={false}
		/>,
	);
	await screen.findByText("相似内容设置");
	fireEvent.click(screen.getByRole("checkbox"));
	fireEvent.change(screen.getByRole("combobox", { name: "模型服务" }), {
		target: { value: "ollama" },
	});
	const baseUrl = screen.getByRole("textbox", { name: "服务地址" }) as HTMLInputElement;
	fireEvent.change(baseUrl, { target: { value: "http://localhost:11434" } });
	fireEvent.click(screen.getByRole("button", { name: "保存相似内容设置" }));
	await screen.findByText("相似内容设置已保存并回读核对。");
	expect(runtime.invoke).toHaveBeenLastCalledWith("setSemanticSettings", {
		bindingRevision: 7,
		expectedSettingsRevision: 4,
		settings: {
			enabled: true,
			provider: "ollama",
			baseUrl: "http://localhost:11434",
			model: "",
			credentialEnv: "",
			remoteConsent: false,
			timeoutMs: 10_000,
			chunkChars: 1200,
			minSimilarity: 0.45,
		},
	});
});

it("keeps semantic writes disabled without the host state grant", async () => {
	const runtime = {
		invoke: vi.fn(async () => ({ ...semantic, canWriteState: false })),
		subscribe: vi.fn(() => () => {}),
	};
	render(
		<NativeKnowledgeSemanticSettings
			client={runtime}
			observationRevision={1}
			refreshing={false}
		/>,
	);
	await screen.findByText(/当前仅授权读取状态/);
	expect((screen.getByRole("button", { name: "保存相似内容设置" }) as HTMLButtonElement).disabled).toBe(true);
	expect(runtime.invoke.mock.calls.map(([operation]) => operation)).toEqual([
		"semanticSettings",
	]);
});
