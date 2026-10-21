import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, "plugin.manifest.json"), "utf8"));

test("manifest tools equal the tools registered by every bundled extension", async () => {
	const knowledgeDir = await mkdtemp(join(tmpdir(), "drone-research-suite-tools-"));
	const previous = process.env.DRONE_KNOWLEDGE_DIR;
	process.env.DRONE_KNOWLEDGE_DIR = knowledgeDir;
	const names = [];
	const pi = {
		registerTool(tool) { names.push(tool.name); },
		registerCommand() {},
		events: { on() {} },
		on() {},
		appendEntry() {},
		sendMessage() {},
		sendUserMessage() {},
	};
	try {
		for (const packageName of ["@gyoungwe/pi-core", "@gyoungwe/pi-knowledge", "@gyoungwe/pi-research"]) {
			const module = await import(pathToFileURL(join(root, "node_modules", ...packageName.split("/"), "dist/index.mjs")).href);
			module.default(pi);
		}
		assert.deepEqual(names, manifest.tools);
	} finally {
		if (previous === undefined) delete process.env.DRONE_KNOWLEDGE_DIR;
		else process.env.DRONE_KNOWLEDGE_DIR = previous;
		await rm(knowledgeDir, { recursive: true, force: true });
	}
});
