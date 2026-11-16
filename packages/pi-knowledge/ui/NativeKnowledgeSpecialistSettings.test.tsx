import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { KnowledgeSpecialistPreferences } from "../src/desktop/specialist-preferences-contract";
import { NativeKnowledgeSpecialistSettings } from "./NativeKnowledgeSpecialistSettings";
import { useLanguage } from "./runtime-api";

vi.mock("./runtime-api", async (original) => ({
	...(await original<typeof import("./runtime-api")>()),
	useLanguage: vi.fn(() => "zh"),
}));

const initial: KnowledgeSpecialistPreferences = {
	mode: "manual",
	revision: 4,
	bindingRevision: 7,
	canWriteState: true,
	maxRunsPerTurn: 4,
	maxRunsPerSession: 20,
	maxToolOperations: 80,
	concurrency: 2,
	maxConcurrency: 4,
	queueLimit: 8,
	queueWaitMs: 15000,
	timeoutMs: 120000,
	maxTokensPerTurn: 24000,
	maxTokensPerSession: 120000,
	maxCostPerTurn: 1,
	maxCostPerSession: 5,
};

function client() {
	return {
		invoke: vi.fn<(_operation: string, _input: unknown) => Promise<unknown>>().mockResolvedValue(initial),
		subscribe: vi.fn(() => () => undefined),
	};
}

function deferred<T>() {
	let resolve: (value: T) => void;
	let reject: (cause: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve: (value: T) => resolve(value), reject: (cause: Error) => reject(cause) };
}

afterEach(() => {
	cleanup();
	vi.mocked(useLanguage).mockReturnValue("zh");
});

it.each([
	{
		language: "zh",
		expected: "每轮最多 3 次；最多并发 2 个（上限 4）；单个最长 91 秒。",
	},
	{
		language: "en",
		expected: "Up to 3 calls per turn; 2 concurrently (maximum 4); up to 91 seconds per run.",
	},
] as const)("shows the configured specialist limits in $language", async ({ language, expected }) => {
	vi.mocked(useLanguage).mockReturnValue(language);
	const runtime = client();
	runtime.invoke.mockResolvedValue({ ...initial, maxRunsPerTurn: 3, timeoutMs: 90500 });
	render(<NativeKnowledgeSpecialistSettings client={runtime} observationRevision={1} refreshing={false} />);
	const limits = await screen.findByTestId("native-knowledge-specialist-limits");
	expect(limits.textContent).toBe(expected);
});

it("does not show specialist limits while the settings value is loading", async () => {
	const runtime = client();
	const read = deferred<KnowledgeSpecialistPreferences>();
	runtime.invoke.mockReturnValueOnce(read.promise);
	render(<NativeKnowledgeSpecialistSettings client={runtime} observationRevision={1} refreshing={false} />);
	expect(screen.getByRole("status").textContent).toBe("正在加载…");
	expect(screen.queryByTestId("native-knowledge-specialist-limits")).toBeNull();
	await act(async () => read.resolve(initial));
});

it("reads the current specialist mode through the bound runtime and shows existing mode and cost copy", async () => {
	const runtime = client();
	render(<NativeKnowledgeSpecialistSettings client={runtime} observationRevision={1} refreshing={false} />);
	expect(screen.getByRole("status").textContent).toBe("正在加载…");
	await screen.findByRole("combobox", { name: "自动调度模式" });
	expect(runtime.invoke).toHaveBeenCalledExactlyOnceWith("specialistSettings", null);
	expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("manual");
	expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
		"按阶段自动调用",
		"仅明确委派",
		"关闭",
	]);
	expect(screen.getByText(/协作助手使用独立模型请求，可能产生费用/)).toBeDefined();
});

it("saves a mode with both observed revisions and displays the runtime's read-back snapshot", async () => {
	const runtime = client();
	render(<NativeKnowledgeSpecialistSettings client={runtime} observationRevision={1} refreshing={false} />);
	const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
	const write = deferred<KnowledgeSpecialistPreferences>();
	runtime.invoke.mockReturnValueOnce(write.promise);
	fireEvent.change(select, { target: { value: "automatic" } });
	expect(runtime.invoke).toHaveBeenLastCalledWith("setSpecialistSettings", {
		mode: "automatic",
		revision: 4,
		bindingRevision: 7,
	});
	expect(select.disabled).toBe(true);
	expect(screen.getByRole("status").textContent).toBe("正在保存…");
	await act(async () => write.resolve({ ...initial, mode: "off", revision: 5 }));
	expect(select.value).toBe("off");
	expect(select.disabled).toBe(false);
	expect(screen.getByRole("status").textContent).toBe("已保存");
	fireEvent.change(select, { target: { value: "manual" } });
	expect(runtime.invoke).toHaveBeenLastCalledWith("setSpecialistSettings", {
		mode: "manual",
		revision: 5,
		bindingRevision: 7,
	});
	await screen.findByText("已保存");
});

it.each([
	{ canWriteState: false, bindingRevision: 7 },
	{ canWriteState: true, bindingRevision: null },
])(
	"never writes when state access is $canWriteState and the binding revision is $bindingRevision",
	async (access) => {
		const runtime = client();
		runtime.invoke.mockResolvedValue({ ...initial, ...access });
		render(<NativeKnowledgeSpecialistSettings client={runtime} observationRevision={1} refreshing={false} />);
		const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
		expect(select.disabled).toBe(true);
		if (!access.canWriteState) expect(screen.getByText(/不能用此开关提升权限/)).toBeDefined();
		fireEvent.change(select, { target: { value: "automatic" } });
		expect(runtime.invoke).toHaveBeenCalledExactlyOnceWith("specialistSettings", null);
	},
);

it.each(["Specialist settings changed; refresh first", "Knowledge binding changed"])(
	"shows a refused write (%s), re-reads, and uses fresh revisions on the next change",
	async (message) => {
		const runtime = client();
		render(<NativeKnowledgeSpecialistSettings client={runtime} observationRevision={1} refreshing={false} />);
		await screen.findByRole("combobox");
		runtime.invoke
			.mockRejectedValueOnce(new Error(message))
			.mockResolvedValueOnce({ ...initial, mode: "off", revision: 6, bindingRevision: 9 });
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "automatic" } });
		await screen.findByText(message);
		await waitFor(() => expect(runtime.invoke).toHaveBeenLastCalledWith("specialistSettings", null));
		const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
		expect(select.value).toBe("off");
		expect(select.disabled).toBe(false);
		expect(screen.queryByText("已保存")).toBeNull();
		fireEvent.change(select, { target: { value: "manual" } });
		expect(runtime.invoke).toHaveBeenLastCalledWith("setSpecialistSettings", {
			mode: "manual",
			revision: 6,
			bindingRevision: 9,
		});
		await screen.findByText("已保存");
		expect(screen.queryByRole("alert")).toBeNull();
	},
);

it.each(["resolve", "reject"] as const)(
	"ignores a stale read's %s after a newer observation",
	async (settle) => {
		const runtime = client();
		const oldRead = deferred<KnowledgeSpecialistPreferences>();
		runtime.invoke.mockReturnValueOnce(oldRead.promise);
		const view = render(
			<NativeKnowledgeSpecialistSettings client={runtime} observationRevision={1} refreshing={false} />,
		);
		runtime.invoke.mockResolvedValue({ ...initial, mode: "off", revision: 8, bindingRevision: 11 });
		view.rerender(
			<NativeKnowledgeSpecialistSettings client={runtime} observationRevision={2} refreshing={false} />,
		);
		const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
		expect(runtime.invoke.mock.calls).toEqual([
			["specialistSettings", null],
			["specialistSettings", null],
		]);
		await act(async () => {
			if (settle === "resolve") oldRead.resolve(initial);
			else oldRead.reject(new Error("Old read failed"));
		});
		expect(select.value).toBe("off");
		expect(select.disabled).toBe(false);
		expect(screen.queryByRole("alert")).toBeNull();
		fireEvent.change(select, { target: { value: "automatic" } });
		expect(runtime.invoke).toHaveBeenLastCalledWith("setSpecialistSettings", {
			mode: "automatic",
			revision: 8,
			bindingRevision: 11,
		});
		await screen.findByText("已保存");
	},
);

it.each(["resolve", "reject"] as const)(
	"ignores an old write's %s after an observation refresh",
	async (settle) => {
		const runtime = client();
		const view = render(
			<NativeKnowledgeSpecialistSettings client={runtime} observationRevision={1} refreshing={false} />,
		);
		await screen.findByRole("combobox");
		const oldWrite = deferred<KnowledgeSpecialistPreferences>();
		runtime.invoke.mockReturnValueOnce(oldWrite.promise);
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "automatic" } });
		runtime.invoke.mockResolvedValue({ ...initial, mode: "off", revision: 8 });
		view.rerender(
			<NativeKnowledgeSpecialistSettings client={runtime} observationRevision={2} refreshing={false} />,
		);
		const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
		await act(async () => {
			if (settle === "resolve") oldWrite.resolve(initial);
			else oldWrite.reject(new Error("Old write failed"));
		});
		expect(select.value).toBe("off");
		expect(select.disabled).toBe(false);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.queryByText("已保存")).toBeNull();
		expect(runtime.invoke.mock.calls.map(([operation]) => operation)).toEqual([
			"specialistSettings",
			"setSpecialistSettings",
			"specialistSettings",
		]);
	},
);
