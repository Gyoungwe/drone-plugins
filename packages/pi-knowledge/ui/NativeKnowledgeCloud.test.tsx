import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CloudStatusResult } from "../src/desktop/cloud-contract";
import { services } from "../test/setup";
import { KnowledgePanel } from "./knowledge/KnowledgePanel";
import { NativeKnowledgeCloud } from "./NativeKnowledgeCloud";
import { en, zh } from "./native-cloud-copy";
import { useLanguage } from "./runtime-api";

vi.mock("./runtime-api", async (original) => ({
	...(await original<typeof import("./runtime-api")>()),
	useLanguage: vi.fn(() => "zh"),
}));
const available: CloudStatusResult = {
	status: "available",
	reason: null,
	configured: true,
	credentialSource: "saved",
	savedConfigured: true,
};
function client(status = available) {
	return {
		invoke: vi.fn(
			async (operation: string, _input: unknown): Promise<unknown> =>
				({
					cloudStatus: status,
					cloudProbe: { status: "ok", result: { initialized: true } },
					readNote: { missing: false, hash: "a".repeat(64) },
					cloudRead: { status: "ok", result: { hash: "b".repeat(64), version: '"v1"' } },
					cloudSync: syncResult("pushed"),
				})[operation],
		),
		subscribe: vi.fn(() => () => undefined),
	};
}
function cloudView(
	runtime = client(),
	bindingRevision: number | null = 3,
	observationRevision = 1,
	refreshing = false,
) {
	return (
		<NativeKnowledgeCloud
			client={runtime}
			observationRevision={observationRevision}
			refreshing={refreshing}
			bindingRevision={bindingRevision}
		/>
	);
}
function mount(runtime = client(), bindingRevision: number | null = 3) {
	return render(cloudView(runtime, bindingRevision));
}
afterEach(() => {
	cleanup();
	vi.mocked(useLanguage).mockReturnValue("zh");
});
function syncResult(status: "pushed" | "conflict", reason: string | null = null) {
	return {
		status: "ok",
		result: {
			mode: "push",
			completed: status === "pushed",
			items: [{ path: "Wiki/topic.md", status, reason, localHash: "a".repeat(64), remoteVersion: '"v1"' }],
			warnings: ["selected_notes_only"],
		},
	};
}
async function ready(runtime = client(), bindingRevision: number | null = 3) {
	const view = mount(runtime, bindingRevision);
	await screen.findByText(zh.available);
	expect(screen.queryByRole("textbox")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: zh.probe }));
	await screen.findByText(zh.initialized);
	return view;
}
async function preview() {
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Wiki/topic.md" } });
	fireEvent.click(screen.getByRole("button", { name: zh.preview }));
	await screen.findByText("aaaaaaaaaaaa");
}
it("keeps zh and en keys equal", () => {
	expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
	expect(Object.keys(zh.reasons).sort()).toEqual(Object.keys(en.reasons).sort());
	expect(Object.keys(zh.items).sort()).toEqual(Object.keys(en.items).sort());
});
it.each(["zh", "en"] as const)(
	"loads only status and discloses every status/source in %s",
	async (language) => {
		vi.mocked(useLanguage).mockReturnValue(language);
		const t = language === "zh" ? zh : en;
		const cases: CloudStatusResult[] = [
			{ ...available, status: "unavailable", reason: "host_unsupported", credentialSource: null },
			{
				status: "not_configured",
				reason: "not_configured",
				configured: false,
				credentialSource: null,
				savedConfigured: false,
			},
			available,
			{ ...available, credentialSource: "env", savedConfigured: false },
			{ ...available, credentialSource: "env", savedConfigured: true },
			{ ...available, credentialSource: null, savedConfigured: null },
		];
		for (const status of cases) {
			const runtime = client(status),
				view = mount(runtime);
			await screen.findByText(t[status.status]);
			expect(runtime.invoke.mock.calls).toEqual([["cloudStatus", null]]);
			expect(screen.getByText(t.httpWarning)).toBeDefined();
			if (status.reason) expect(screen.getByText(t.reasons[status.reason])).toBeDefined();
			if (status.credentialSource) expect(screen.getByText(t[status.credentialSource])).toBeDefined();
			else expect(view.container.querySelector("[data-testid=cloud-source]")).toBeNull();
			expect(Boolean(screen.queryByText(t.savedUnused))).toBe(
				status.credentialSource === "env" && status.savedConfigured === true,
			);
			expect([...view.container.querySelectorAll("input")].every((input) => input.type === "text")).toBe(
				true,
			);
			if (status.status !== "available")
				expect((screen.getByRole("button", { name: t.probe }) as HTMLButtonElement).disabled).toBe(true);
			if (status.reason === "host_unsupported")
				expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(
					true,
				);
			view.unmount();
		}
	},
);
it("refreshes status only and ignores stale status responses after observation changes", async () => {
	const runtime = client();
	let complete: (value: unknown) => void = () => undefined;
	runtime.invoke.mockReturnValueOnce(
		new Promise((done) => {
			complete = done;
		}),
	);
	const view = mount(runtime);
	view.rerender(cloudView(runtime, 3, 2, false));
	await screen.findByText(zh.available);
	await act(async () => complete({ ...available, status: "not_configured", reason: "not_configured" }));
	expect(screen.queryByText(zh.not_configured)).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: zh.refresh }));
	await waitFor(() => expect(runtime.invoke).toHaveBeenCalledTimes(3));
	expect(runtime.invoke.mock.calls).toEqual(Array.from({ length: 3 }, () => ["cloudStatus", null]));
});
it("probes only on click and offers initialization only after an uninitialized probe", async () => {
	const runtime = client();
	mount(runtime);
	await screen.findByText(zh.available);
	expect(screen.queryByRole("button", { name: zh.initialize })).toBeNull();
	runtime.invoke.mockResolvedValueOnce({ status: "ok", result: { initialized: false } });
	fireEvent.click(screen.getByRole("button", { name: zh.probe }));
	await screen.findByText(zh.uninitialized);
	expect(runtime.invoke).toHaveBeenLastCalledWith("cloudProbe", null);
	runtime.invoke.mockResolvedValueOnce({ status: "ok", result: { initialized: true } });
	fireEvent.click(screen.getByRole("button", { name: zh.initialize }));
	await screen.findByText(zh.initialized);
	expect(runtime.invoke).toHaveBeenLastCalledWith("cloudInitialize", null);
	expect(screen.queryByRole("button", { name: zh.initialize })).toBeNull();
});
it.each(["zh", "en"] as const)(
	"localizes all runtime failures and hides thrown details in %s",
	async (language) => {
		vi.mocked(useLanguage).mockReturnValue(language);
		const t = language === "zh" ? zh : en;
		const runtime = client();
		mount(runtime);
		await screen.findByText(t.available);
		for (const reason of [
			"host_unsupported",
			"not_configured",
			"offline",
			"unauthorized",
			"forbidden",
			"not_found",
			"conflict",
			"protocol",
			"unexpected-code",
		]) {
			runtime.invoke.mockResolvedValueOnce({ status: "failed", reason });
			fireEvent.click(screen.getByRole("button", { name: t.probe }));
			const alert = await screen.findByRole("alert");
			expect(alert.textContent).toBe(
				reason === "unexpected-code" ? t.genericError : t.reasons[reason as keyof typeof t.reasons],
			);
			expect(screen.queryByText(reason, { exact: true })).toBeNull();
		}
		for (const cause of [new Error("private-runtime-detail"), "offline"]) {
			runtime.invoke.mockRejectedValueOnce(cause);
			fireEvent.click(screen.getByRole("button", { name: t.probe }));
			await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(t.genericError));
		}
		expect(screen.queryByText(/private-runtime-detail/)).toBeNull();
	},
);

it.each(["pull", "push"] as const)(
	"previews both hashes and sends that preview for %s; path changes clear it",
	async (mode) => {
		const runtime = client();
		await ready(runtime);
		await preview();
		expect(runtime.invoke.mock.calls.slice(2)).toEqual([
			["readNote", { path: "Wiki/topic.md", revision: 3, startLine: 1 }],
			["cloudRead", { path: "Wiki/topic.md" }],
		]);
		expect(screen.getByText("bbbbbbbbbbbb")).toBeDefined();
		expect(screen.getByText('"v1"')).toBeDefined();
		expect(screen.getByText(zh.different)).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: zh[mode] }));
		await screen.findByText(zh.items.pushed);
		expect(runtime.invoke).toHaveBeenLastCalledWith("cloudSync", {
			mode,
			bindingRevision: 3,
			paths: ["Wiki/topic.md"],
			previews: [
				{
					path: "Wiki/topic.md",
					localHash: "a".repeat(64),
					remoteHash: "b".repeat(64),
					remoteVersion: '"v1"',
				},
			],
		});
		expect(screen.getByText(zh.selectedNotesOnly)).toBeDefined();
		await preview();
		fireEvent.change(screen.getByRole("textbox"), { target: { value: "Wiki/other.md" } });
		expect(screen.queryByText("aaaaaaaaaaaa")).toBeNull();
		for (const name of [zh.pull, zh.push])
			expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
	},
);

it.each(["local", "remote"] as const)(
	"requires explicit %s conflict resolution with a fresh preview",
	async (resolution) => {
		const runtime = client();
		await ready(runtime);
		await preview();
		runtime.invoke.mockResolvedValueOnce(syncResult("conflict", "divergent"));
		fireEvent.click(screen.getByRole("button", { name: zh.push }));
		await screen.findByText(zh.items.conflict);
		expect(screen.getByText(zh.reasons.divergent)).toBeDefined();
		expect(screen.getByRole("button", { name: zh.keepLocal })).toBeDefined();
		expect(screen.getByRole("button", { name: zh.keepCloud })).toBeDefined();
		expect(runtime.invoke).toHaveBeenCalledTimes(5);
		runtime.invoke
			.mockResolvedValueOnce({ missing: false, hash: "c".repeat(64) })
			.mockResolvedValueOnce({ status: "ok", result: { hash: "d".repeat(64), version: '"v2"' } });
		fireEvent.click(
			screen.getByRole("button", { name: resolution === "local" ? zh.keepLocal : zh.keepCloud }),
		);
		await screen.findByText(zh.items.pushed);
		expect(runtime.invoke.mock.calls.slice(5, 7)).toEqual([
			["readNote", { path: "Wiki/topic.md", revision: 3, startLine: 1 }],
			["cloudRead", { path: "Wiki/topic.md" }],
		]);
		expect(runtime.invoke).toHaveBeenLastCalledWith("cloudSync", {
			mode: resolution === "local" ? "push" : "pull",
			resolution,
			bindingRevision: 3,
			paths: ["Wiki/topic.md"],
			previews: [
				{
					path: "Wiki/topic.md",
					localHash: "c".repeat(64),
					remoteHash: "d".repeat(64),
					remoteVersion: '"v2"',
				},
			],
		});
	},
);

it("previews missing notes as null hashes and versions without sending note content", async () => {
	const runtime = client();
	const view = await ready(runtime);
	runtime.invoke
		.mockResolvedValueOnce({ missing: true })
		.mockResolvedValueOnce({ status: "failed", reason: "not_found" });
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Wiki/topic.md" } });
	fireEvent.click(screen.getByRole("button", { name: zh.preview }));
	await screen.findByText(zh.same);
	expect(screen.getAllByText(zh.missing)).toHaveLength(2);
	fireEvent.click(screen.getByRole("button", { name: zh.pull }));
	await screen.findByText(zh.items.pushed);
	expect(runtime.invoke).toHaveBeenLastCalledWith("cloudSync", {
		mode: "pull",
		bindingRevision: 3,
		paths: ["Wiki/topic.md"],
		previews: [{ path: "Wiki/topic.md", localHash: null, remoteHash: null, remoteVersion: null }],
	});
	expect([...view.container.querySelectorAll("input")].every((input) => input.type === "text")).toBe(true);
});

it("requires binding and disables every button while busy or refreshing", async () => {
	const runtime = client(),
		unbound = await ready(runtime, null);
	expect(screen.queryByRole("textbox")).toBeNull();
	unbound.unmount();
	const view = await ready(runtime);
	await preview();
	let complete: (value: unknown) => void = () => undefined;
	runtime.invoke.mockReturnValueOnce(
		new Promise((done) => {
			complete = done;
		}),
	);
	fireEvent.click(screen.getByRole("button", { name: zh.push }));
	expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
	await act(async () => complete(syncResult("pushed")));
	view.rerender(cloudView(runtime, 3, 1, true));
	expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
});

it("drops a conflict resolution preview when the binding changes before it completes", async () => {
	const runtime = client(),
		view = await ready(runtime);
	await preview();
	runtime.invoke.mockResolvedValueOnce(syncResult("conflict", "divergent"));
	fireEvent.click(screen.getByRole("button", { name: zh.push }));
	await screen.findByText(zh.items.conflict);
	let complete: (value: unknown) => void = () => undefined;
	runtime.invoke.mockReturnValueOnce(
		new Promise((done) => {
			complete = done;
		}),
	);
	fireEvent.click(screen.getByRole("button", { name: zh.keepLocal }));
	view.rerender(cloudView(runtime, 4, 1, false));
	await act(async () => complete({ missing: false, hash: "c".repeat(64) }));
	expect(runtime.invoke.mock.calls.filter(([op]) => op === "cloudSync")).toHaveLength(1);
	expect(screen.queryByText("cccccccccccc")).toBeNull();
});

it.each(["zh", "en"] as const)("localizes every sync item status and reason in %s", async (language) => {
	const runtime = client();
	await ready(runtime);
	await preview();
	vi.mocked(useLanguage).mockReturnValue(language);
	const t = language === "zh" ? zh : en;
	const statuses = ["unchanged", "pulled", "pushed", "conflict", "skipped", "failed"];
	const reasons = Object.keys(t.reasons);
	const items = reasons.map((reason, index) => ({
		path: `Wiki/note-${index}.md`,
		status: statuses[index % statuses.length],
		reason,
		localHash: null,
		remoteVersion: null,
	}));
	runtime.invoke.mockResolvedValueOnce({
		status: "ok",
		result: { mode: "push", completed: false, items, warnings: ["selected_notes_only"] },
	});
	fireEvent.click(screen.getByRole("button", { name: zh.push }));
	await screen.findByText(t.selectedNotesOnly);
	for (const label of Object.values(t.items)) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
	for (const label of Object.values(t.reasons)) expect(screen.getByText(label)).toBeDefined();
	for (const reason of reasons) expect(screen.queryByText(reason, { exact: true })).toBeNull();
});

it.each(["cloudProbe", "cloudSync"] as const)(
	"keeps buttons disabled until a superseded %s settles",
	async (operation) => {
		const runtime = client(),
			view = await ready(runtime);
		if (operation === "cloudSync") await preview();
		let complete: (value: unknown) => void = () => undefined;
		runtime.invoke.mockReturnValueOnce(
			new Promise((done) => {
				complete = done;
			}),
		);
		fireEvent.click(screen.getByRole("button", { name: operation === "cloudProbe" ? zh.probe : zh.push }));
		view.rerender(cloudView(runtime, 3, 2));
		await screen.findByText(zh.available);
		expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(
			true,
		);
		await act(async () =>
			complete(
				operation === "cloudProbe" ? { status: "ok", result: { initialized: true } } : syncResult("pushed"),
			),
		);
		expect((screen.getByRole("button", { name: zh.probe }) as HTMLButtonElement).disabled).toBe(false);
	},
);
it.each(["overview", "settings"] as const)("removes cloud controls from the legacy %s panel", async (tab) => {
	services.getKnowledgeOverview = vi.fn(async () => ({ binding: null, enabled: true }));
	services.getKnowledgeCloudStatus = vi.fn();
	await act(async () => {
		render(<KnowledgePanel context={{ cwd: null, sessionId: null, tab }} />);
	});
	expect(screen.getByTestId("knowledge-panel")).toBeDefined();
	expect(screen.queryByText(zh.title)).toBeNull();
	expect(services.getKnowledgeCloudStatus).not.toHaveBeenCalled();
});
