import { afterEach, expect, test, vi } from "vitest";
import { WorkbenchPanel } from "./index";

afterEach(() => vi.unstubAllGlobals());

test("renders active tasks and a host-owned memory empty state", () => {
	const createElement = (type: string, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props, children });
	vi.stubGlobal("window", {
		DroneUI: {
			React: { createElement, memo: <T,>(component: T) => component },
			hooks: { useLanguage: () => "en" },
			stores: {
				useSessionsStore: (selector: (state: { activeSessionId: string | null }) => unknown) => selector({ activeSessionId: "s1" }),
				useTranscriptStore: (selector: (state: { bySession: Record<string, unknown> }) => unknown) => selector({ bySession: { s1: { todos: [{ content: "Review evidence", status: "in_progress" }] } } }),
			},
		},
	});
	const panel = WorkbenchPanel();
	expect(panel).toMatchObject({ type: "section", props: { "data-drone-ui-workbench": "panel" } });
	const serialized = JSON.stringify(panel);
	expect(serialized).toContain("Review evidence");
	expect(serialized).toContain("No saved workbench memory yet.");
});
