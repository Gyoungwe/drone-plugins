import { describe, expect, it } from "vitest";
import { citationUri, pageRange, registerEvidenceLoop } from "../src/evidence-loop.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("PDF page citation markers", () => {
	it("returns separate native source ranges without claiming their unread gap", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "research-ranges-"));
		try {
			await writeFile(
				join(cwd, "source.md"),
				Array.from({ length: 12 }, (_, index) => `Range ${index + 1} ${"evidence ".repeat(7)}`).join("\n"),
			);
			const tools = new Map<string, any>();
			registerEvidenceLoop({ registerTool: (tool: any) => tools.set(tool.name, tool) });
			const call = (name: string, params: unknown) =>
				tools.get(name).execute("call", params, undefined, undefined, { cwd, sessionId: "ranges" });
			const search = await call("research_search_sources", { query: "Range", source_dir: "." });
			const id = search.details.hits[0].source_id;
			await call("research_read_source", { source_id: id, max_chars: 200 });
			const second = await call("research_read_source", { source_id: id, start_line: 9, max_chars: 200 });
			expect(second.details.read_receipts.map((range: any) => [range.start_line, range.end_line])).toEqual([
				[1, 2],
				[9, 10],
			]);
			expect(second.details.content).not.toContain("Range 8 ");
			expect(second.details.read_receipt.receipt_id).not.toBe(second.details.read_receipts[0].receipt_id);
			await writeFile(join(cwd, "source.md"), "Changed after the reads.");
			await expect(
				call("research_deposit_research_note", {
					title: "Candidate",
					markdown: "Old result",
					source_ids: [id],
				}),
			).rejects.toThrow("Source changed");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
	it("finds the pages actually present in a read excerpt", () => {
		expect(pageRange("[[page:5]] methods\n[[page:6]] results")).toEqual({ start: 5, end: 6 });
		expect(pageRange("plain text")).toBeUndefined();
	});

	it("adds a page fragment only when a page was read", () => {
		expect(citationUri("file.pdf", { start: 5, end: 6 })).toBe("file.pdf#page=5");
		expect(citationUri("note.md", undefined)).toBe("note.md");
	});
});
