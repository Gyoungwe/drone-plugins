import type { SessionMeta, SessionUiPort, UIMessage } from "@gyoungwe/plugin-api/ui";
import { afterEach, vi } from "vitest";
import type { WorkbenchTranscriptState } from "../ui/api";

const transcripts: WorkbenchTranscriptState = { bySession: {} };

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
	transcripts,
	active: false,
	prompt: vi.fn<SessionUiPort["command"]>(async () => ({ kind: "command" })),
	preview: vi.fn(),
};
Object.assign(window, {
	DroneUI: {
		sessions: { prompt: uiFixture.prompt, command: uiFixture.prompt },
		hooks: {
			useSessionMessages: () => uiFixture.messages,
			useLanguage: () => uiFixture.language,
			useAgentActive: () => uiFixture.active,
		},
		stores: {
			useSessionsStore: (selector: (state: typeof uiFixture.sessions) => unknown) =>
				selector(uiFixture.sessions),
			useTranscriptStore: (selector: (state: WorkbenchTranscriptState) => unknown) =>
				selector(uiFixture.transcripts),
			useUiStore: (selector: (state: { openResourcePreview: typeof uiFixture.preview }) => unknown) =>
				selector({ openResourcePreview: uiFixture.preview }),
		},
		helpers: {
			openExternal: vi.fn(async () => {}),
			openResourceExternal: vi.fn(async () => {}),
		},
	},
});
afterEach(() => {
	uiFixture.sessions.activeSessionId = "session";
	uiFixture.language = "zh";
	uiFixture.messages = [];
	uiFixture.transcripts.bySession = {};
	uiFixture.active = false;
	uiFixture.prompt.mockClear();
	uiFixture.preview.mockClear();
});
