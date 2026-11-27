import type { DroneUiRuntime, PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const invoke = vi.fn<PluginUiRuntimeClient["invoke"]>();
const runtime: PluginUiRuntimeClient = { invoke, subscribe: () => () => undefined };
const usePluginRuntime = vi.fn(() => runtime);
const sessions = { activeSessionId: "session" };

export const uiFixture = {
	invoke,
	usePluginRuntime,
	language: "en" as ReturnType<DroneUiRuntime["hooks"]["useLanguage"]>,
};

Object.assign(window, {
	DroneUI: {
		hooks: {
			usePluginRuntime,
			useLanguage: () => uiFixture.language,
		},
		stores: {
			useSessionsStore: (selector: (state: typeof sessions) => unknown) => selector(sessions),
		},
	},
});

afterEach(() => {
	cleanup();
	invoke.mockReset();
	usePluginRuntime.mockReset();
	uiFixture.language = "en";
});
