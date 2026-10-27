import type { SessionMeta, UIMessage } from "@gyoungwe/plugin-api/ui";
import { afterEach, vi } from "vitest";

export const uiFixture = {
	language: "zh" as "zh" | "en",
	messages: [] as UIMessage[],
	sessions: {
		activeSessionId: "session" as string | null,
		cwd: "/project",
		sessions: [
			{
				sessionId: "session",
				cwd: "/project",
				active: true,
				messageCount: 0,
				createdAt: 0,
			},
		] as SessionMeta[],
	},
	active: false,
	prompt: vi.fn(async () => ({ kind: "command" })),
	preview: vi.fn(),
};
window.DroneUI = {
	sessions: { prompt: uiFixture.prompt },
	hooks: {
		useSessionMessages: () => uiFixture.messages,
		useLanguage: () => uiFixture.language,
		useAgentActive: () => uiFixture.active,
	},
	stores: {
		useSessionsStore: (
			selector: (state: typeof uiFixture.sessions) => unknown,
		) => selector(uiFixture.sessions),
		useUiStore: (
			selector: (state: {
				openResourcePreview: typeof uiFixture.preview;
			}) => unknown,
		) => selector({ openResourcePreview: uiFixture.preview }),
	},
	helpers: {
		openExternal: vi.fn(async () => {}),
		openResourceExternal: vi.fn(async () => {}),
	},
} as unknown as typeof window.DroneUI;
afterEach(() => {
	uiFixture.sessions.activeSessionId = "session";
	uiFixture.language = "zh";
	uiFixture.messages = [];
	uiFixture.active = false;
	uiFixture.prompt.mockClear();
	uiFixture.preview.mockClear();
});
