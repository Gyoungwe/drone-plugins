import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { services } from "../../test/setup";
import { knowledgeZh } from "./copy";
import { KnowledgePanel } from "./KnowledgePanel";

afterEach(cleanup);

it("leaves research runs to their owning plugin in the knowledge overview", async () => {
	services.getKnowledgeOverview = async () => ({ binding: null, enabled: true, bound: false });
	await act(async () => {
		render(<KnowledgePanel context={{ cwd: null, sessionId: null, tab: "overview" }} />);
	});
	expect(screen.getByRole("heading", { name: knowledgeZh.literature })).toBeDefined();
	expect(screen.queryByTestId(/^research-runs-/)).toBeNull();
});
