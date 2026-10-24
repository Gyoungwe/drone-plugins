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

it.each([
	["Library/Methods/mapping-tools.md", "method", "method"],
	["Library/Software/paper-mapping.md", "method", "method"],
	["Library/Methods/paper-analysis.md", "software", "software"],
	["Library/Ideas/tool-protocol.md", "idea", "idea"],
	["Library/Papers/tool-protocol.md", "paper", "paper"],
	["Library/Methods/mapping-tools.md", "", "method"],
	["Library/Software/paper-protocol.md", "", "software"],
	["Inbox/mapping-tools.md", "", "software"],
	["Library/Concepts/mapping-tools.md", "concept", "other"],
])("classifies %s with type %s as %s", (path, type, category) => {
	const groups = recentByCategory([{ path, title: "Mapping tools", kind: "note", signature: "1:x", body: type ? `---\ntype: ${type}\n---\n` : "# Mapping tools" }]);
	for (const [key, notes] of Object.entries(groups)) expect(notes.map((note) => note.path)).toEqual(key === category ? [path] : []);
});
