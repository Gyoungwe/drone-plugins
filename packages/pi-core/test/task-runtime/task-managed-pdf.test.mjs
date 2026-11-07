import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { harness, plan, taskAction } from "./managed-harness.mjs";

// Managed plugins get no worker threads: PDF identity comes from the host's isolated parser.
it("a downloaded PDF is identified by the host's isolated PDF text, not a worker in the managed process", async () => {
	const pdfCalls = [];
	const t = await harness({
		extra: {
			"document.pdfText": ({ base64 }) => {
				pdfCalls.push(Buffer.from(base64, "base64").toString("latin1"));
				return { text: "[[page:1]]\nGut microbiota doi:10.1000/gut.2021.001\n", pages: 1, partial: false };
			},
		},
	});
	await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
	await t.tool("task_plan", plan);
	const action = await t.tool("task_wait", {
		kind: "download",
		title: "Gut microbiota",
		reason: "Download the paper",
		doi: "10.1000/gut.2021.001",
	});
	// Not parseable by pdf.js: only the host capability can have produced the identity.
	await writeFile(join(t.cwd, "out/paper.pdf"), "%PDF-1.4 bytes the host parses");
	const { snapshot } = await t.app.operations.status.execute(null, { signal: t.ctx.signal });
	await t.command("task-status", "");
	const { revision } = t.host.notices.at(-1).view;
	await t.command(
		"task-action",
		taskAction({ taskId: snapshot.id, revision, actionId: action.id, action: "file", path: "out/paper.pdf" }),
	);
	expect(pdfCalls).toEqual(["%PDF-1.4 bytes the host parses"]);
	const handed = t.host.notices
		.at(-1)
		.view.tasks.flatMap((task) => task.actions)
		.find((item) => item.id === action.id);
	expect(handed.file).toMatchObject({ kind: "pdf", identity: "metadata-matched", extraction: { pages: 1 } });
	await t.close();
});
