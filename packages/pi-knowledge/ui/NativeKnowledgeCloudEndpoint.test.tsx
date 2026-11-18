import type { PluginRuntimeContext, PluginRuntimeFactoryContext } from "@gyoungwe/plugin-api/runtime";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { withCloudOperations } from "../src/desktop/cloud-runtime";
import { NativeKnowledgeCloud } from "./NativeKnowledgeCloud";
import { en, zh } from "./native-cloud-copy";
import { useLanguage } from "./runtime-api";

vi.mock("./runtime-api", async (original) => ({
	...(await original<typeof import("./runtime-api")>()),
	useLanguage: vi.fn(() => "zh"),
}));
afterEach(() => {
	cleanup();
	vi.mocked(useLanguage).mockReturnValue("zh");
});
const endpoint = "https://dav.example.test:8443";
const ready = { state: "ready", endpoint, source: "env" };

async function mount(configuration: unknown = ready, supported = true) {
	const network = vi.fn();
	const call = vi.fn(async (name: string) => {
		if (name === "config.endpoint") {
			if (!supported) throw { message: "Plugin capability is not registered: config.endpoint" };
			return configuration;
		}
		if (name === "credentials.status")
			return {
				slots: {
					webdav: {
						configured: true,
						authentication: "http-basic-digest",
						source: "saved",
						savedConfigured: true,
					},
				},
			};
		if (name.startsWith("network.")) return network();
		throw new Error(`Unexpected capability ${name}`);
	});
	const context: PluginRuntimeFactoryContext = {
		applicationId: "synthetic-ui",
		signal: new AbortController().signal,
		resources: [],
		capabilities: { call },
		events: { changed: vi.fn() },
	};
	const runtime = await withCloudOperations(async () => ({ operations: {}, dispose: async () => undefined }))(
		context,
	);
	const caller: PluginRuntimeContext = {
		capabilities: { call },
		signal: context.signal,
		scope: { kind: "application" },
	};
	const client = {
		invoke: vi.fn(async (name: string, input: unknown) => runtime.operations[name].execute(input, caller)),
		subscribe: vi.fn(() => () => undefined),
	};
	const view = render(
		<NativeKnowledgeCloud
			client={client}
			observationRevision={1}
			refreshing={false}
			bindingRevision={null}
		/>,
	);
	return { ...view, network, call, client };
}

it.each(["zh", "en"] as const)(
	"renders the full endpoint and separate default/env source lines in %s",
	async (language) => {
		vi.mocked(useLanguage).mockReturnValue(language);
		const t = language === "zh" ? zh : en;
		for (const source of ["env", "default"] as const) {
			const f = await mount({ ...ready, source });
			await screen.findByText(endpoint);
			expect(screen.getByText(t.effectiveEndpoint)).toBeDefined();
			expect(screen.getByText(source === "env" ? t.endpointEnv : t.endpointDefault)).toBeDefined();
			expect(screen.getByTestId("cloud-source").textContent).toBe(t.saved);
			expect(f.client.invoke.mock.calls).toEqual([["cloudStatus", null]]);
			expect(f.network).not.toHaveBeenCalled();
			f.unmount();
		}
	},
);

it.each(["zh", "en"] as const)(
	"renders invalid endpoint copy with no URL or network requests in %s",
	async (language) => {
		vi.mocked(useLanguage).mockReturnValue(language);
		const t = language === "zh" ? zh : en;
		const f = await mount({
			state: "invalid",
			endpoint: null,
			source: "env",
			reason: "invalid_endpoint",
			raw: "synthetic-invalid-value",
		});
		await screen.findByText(t.reasons.invalid_endpoint);
		expect(screen.queryByText(endpoint)).toBeNull();
		expect(f.container.textContent).not.toContain("synthetic-invalid-value");
		expect(screen.queryByText(t.httpWarning)).toBeNull();
		expect(f.network).not.toHaveBeenCalled();
	},
);

it.each(["http", "https"] as const)(
	"shows the HTTP warning only for an effective %s endpoint",
	async (protocol) => {
		const f = await mount({ ...ready, endpoint: `${protocol}://dav.example.test:8080` });
		await screen.findByText(zh.available);
		expect(Boolean(screen.queryByText(zh.httpWarning))).toBe(protocol === "http");
		expect(f.network).not.toHaveBeenCalled();
	},
);

it("renders a long bracketed IPv6 origin in full with selectable wrapping text", async () => {
	const origin = "https://[2001:db8:1234:5678:9abc:def0:1234:5678]:65535";
	const f = await mount({ ...ready, endpoint: origin });
	const row = await screen.findByText(origin);
	expect(row.textContent).toBe(origin);
	expect(row.style.userSelect).toBe("text");
	expect(row.style.overflowWrap).toBe("anywhere");
	expect(f.network).not.toHaveBeenCalled();
});

it("keeps unsupported hosts unavailable without a URL, warning or automatic probe", async () => {
	const f = await mount(ready, false);
	await screen.findByText(zh.unavailable);
	expect(screen.getByText(zh.reasons.host_unsupported)).toBeDefined();
	expect(screen.queryByText(endpoint)).toBeNull();
	expect(screen.queryByText(zh.httpWarning)).toBeNull();
	expect(f.client.invoke.mock.calls).toEqual([["cloudStatus", null]]);
	expect(f.network).not.toHaveBeenCalled();
});
