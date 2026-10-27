import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { KnowledgePreferences } from "../src/desktop/contract";
import { NativeKnowledgePreferences } from "./NativeKnowledgePreferences";
import { KnowledgePage } from "./entry";
import { services, sessions, setPluginRuntime } from "../test/setup";
const version = "a".repeat(64);
const initial: KnowledgePreferences = {
	binding: {
		vaultId: "vault",
		revision: 3,
		label: "Library",
		vault: "/selected/library",
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "read-local",
		updatedAt: "2026-10-26",
	},
	canWriteState: true,
	reviewPolicy: {
		mode: "strict",
		persistedMode: "strict",
		version,
		override: null,
		diagnostic: null,
	},
};
function client() {
	return {
		invoke: vi.fn(
			async (_operation: string, _input: unknown): Promise<unknown> => initial,
		),
		subscribe: vi.fn(() => () => {}),
	};
}
afterEach(cleanup);
it("displays binding details and saves the chosen mode with the observed state version", async () => {
	const runtime = client();
	render(
		<NativeKnowledgePreferences
			client={runtime}
			observationRevision={1}
			refreshing={false}
		/>,
	);
	await screen.findByText("/selected/library");
	expect(screen.getByText("混合资料")).toBeDefined();
	expect(runtime.invoke).toHaveBeenCalledWith("preferences", null);
	fireEvent.change(screen.getByRole("combobox", { name: "审核策略" }), {
		target: { value: "automatic" },
	});
	runtime.invoke.mockResolvedValueOnce({
		...initial,
		reviewPolicy: {
			...initial.reviewPolicy,
			mode: "automatic",
			persistedMode: "automatic",
			version: "b".repeat(64),
		},
	});
	fireEvent.click(screen.getByRole("button", { name: "保存审核策略" }));
	await screen.findByText("策略已保存并回读核对。");
	expect(runtime.invoke).toHaveBeenLastCalledWith("setReviewPolicy", {
		bindingRevision: 3,
		expectedVersion: version,
		mode: "automatic",
	});
	expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
		"automatic",
	);
});
it("keeps state mutation disabled when the real resource grant is read-only", async () => {
	const runtime = client();
	runtime.invoke.mockResolvedValue({ ...initial, canWriteState: false });
	render(
		<NativeKnowledgePreferences
			client={runtime}
			observationRevision={1}
			refreshing={false}
		/>,
	);
	await screen.findByText(/当前仅授权读取状态/);
	expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
		true,
	);
	expect(
		(screen.getByRole("button", { name: "保存审核策略" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	expect(runtime.invoke.mock.calls.map(([op]) => op)).toEqual([
		"preferences",
		"semanticSettings",
	]);
});
it.each(["invalid-json", "invalid-policy"] as const)(
	"shows %s as a strict diagnostic without offering to overwrite it",
	async (diagnostic) => {
		const runtime = client();
		runtime.invoke.mockResolvedValue({
			...initial,
			reviewPolicy: {
				...initial.reviewPolicy,
				persistedMode: null,
				diagnostic,
			},
		});
		render(
			<NativeKnowledgePreferences
				client={runtime}
				observationRevision={1}
				refreshing={false}
			/>,
		);
		await screen.findByRole("alert");
		expect(screen.getByRole("alert").textContent).toContain("当前执行严格模式");
		expect(
			(
				screen.getByRole("button", {
					name: "保存审核策略",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	},
);
it("does not claim success on a concurrent state conflict and uses a fresh version only after refresh", async () => {
	const runtime = client();
	const view = render(
		<NativeKnowledgePreferences
			client={runtime}
			observationRevision={1}
			refreshing={false}
		/>,
	);
	await screen.findByText("/selected/library");
	fireEvent.change(screen.getByRole("combobox"), {
		target: { value: "automatic" },
	});
	runtime.invoke.mockRejectedValueOnce(
		new Error("ESTATECONFLICT: policy changed"),
	);
	fireEvent.click(screen.getByRole("button", { name: "保存审核策略" }));
	await screen.findByText("ESTATECONFLICT: policy changed");
	expect(screen.queryByText("策略已保存并回读核对。")).toBeNull();
	runtime.invoke.mockResolvedValue({
		...initial,
		reviewPolicy: { ...initial.reviewPolicy, version: "b".repeat(64) },
	});
	view.rerender(
		<NativeKnowledgePreferences
			client={runtime}
			observationRevision={2}
			refreshing={false}
		/>,
	);
	await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
	await screen.findByText("/selected/library");
	fireEvent.change(screen.getByRole("combobox"), {
		target: { value: "automatic" },
	});
	fireEvent.click(screen.getByRole("button", { name: "保存审核策略" }));
	await waitFor(() =>
		expect(runtime.invoke).toHaveBeenLastCalledWith("setReviewPolicy", {
			bindingRevision: 3,
			expectedVersion: "b".repeat(64),
			mode: "automatic",
		}),
	);
});
it("ignores an old settings response after a new observation has been requested", async () => {
	const runtime = client();
	let resolve!: (value: unknown) => void;
	runtime.invoke.mockReturnValueOnce(
		new Promise((done) => {
			resolve = done;
		}),
	);
	const view = render(
		<NativeKnowledgePreferences
			client={runtime}
			observationRevision={1}
			refreshing={false}
		/>,
	);
	runtime.invoke.mockResolvedValue({
		...initial,
		binding: { ...initial.binding!, vault: "/selected/new" },
	});
	view.rerender(
		<NativeKnowledgePreferences
			client={runtime}
			observationRevision={2}
			refreshing={false}
		/>,
	);
	await screen.findByText("/selected/new");
	await act(async () => resolve(initial));
	expect(screen.queryByText("/selected/library")).toBeNull();
});
it("keeps settings reachable without a binding and never invokes the legacy settings facade", async () => {
	const runtime = client();
	runtime.invoke.mockImplementation(async (op) =>
		op === "overview"
			? {
					state: "unconfigured",
					binding: null,
					project: null,
					index: null,
					recentNotes: [],
				}
			: { ...initial, binding: null, canWriteState: false },
	);
	setPluginRuntime(runtime);
	sessions.setState({ activeSessionId: null });
	services.maintainKnowledge = vi.fn(() => {
		throw new Error("Legacy settings must not run");
	});
	render(<KnowledgePage />);
	fireEvent.click(screen.getByRole("button", { name: "设置" }));
	await screen.findByText("当前知识库绑定");
	expect(screen.getByText("尚未绑定知识库")).toBeDefined();
	expect(screen.queryByRole("combobox")).toBeNull();
	expect(services.maintainKnowledge).not.toHaveBeenCalled();
});

it("does not offer to override an environment-enforced strict policy", async () => {
	const runtime = client();
	runtime.invoke.mockResolvedValue({
		...initial,
		reviewPolicy: {
			...initial.reviewPolicy,
			mode: "strict",
			persistedMode: "automatic",
			override: "environment",
		},
	});
	render(
		<NativeKnowledgePreferences
			client={runtime}
			observationRevision={1}
			refreshing={false}
		/>,
	);
	await screen.findByText("环境策略强制严格审核；此处不能覆盖。");
	expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
		true,
	);
	expect(
		(screen.getByRole("button", { name: "保存审核策略" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
});
