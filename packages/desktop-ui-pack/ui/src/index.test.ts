import { afterEach, expect, test, vi } from "vitest";
import * as ui from "./index";

afterEach(() => vi.unstubAllGlobals());

test("research-only package does not register or export moved knowledge surfaces", () => {
	expect(Object.keys(ui)).toEqual(["ResearchStatusPanel"]);
	vi.stubGlobal("window", { DroneUI: {
		React: { createElement: (type: string, props: object, ...children: unknown[]) => ({ type, props, children }) },
		hooks: { useLanguage: () => "en" },
	} });
	expect(ui.ResearchStatusPanel()).toMatchObject({ type: "section", props: { "data-drone-ui-pack": "research-status" } });
});
