import { describe, expect, it } from "vitest";
import { recentByCategory } from "../src/core/recent-by-category.js";

describe("recentByCategory", () => {
	it("filters by the same category rules as the worker and keeps newest first", () => {
		const groups = recentByCategory([
			{ path: "Library/Papers/old.md", title: "Old", kind: "note", signature: "1:x", body: "---\ntype: paper\n---" },
			{ path: "Library/Papers/new.md", title: "New", kind: "note", signature: "3:x", body: "---\ntype: paper\n---" },
			{ path: "Library/Methods/m.md", title: "Method", kind: "note", signature: "2:x", body: "---\ntype: method\n---" },
			{ path: "Library/Other/o.md", title: "Other", kind: "note", signature: "4:x", body: "---\ntype: entity\n---" },
		], 1);
		expect(groups.paper.map((note) => note.path)).toEqual(["Library/Papers/new.md"]);
		expect(groups.method.map((note) => note.path)).toEqual(["Library/Methods/m.md"]);
		expect(groups.software).toEqual([]);
	});
});
