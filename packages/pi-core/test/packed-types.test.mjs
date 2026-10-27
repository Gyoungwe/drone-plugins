import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(packageRoot, "../..");

test("packed public entries provide their own declarations to a clean TypeScript consumer", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-core-types-"));
	try {
		const packed = await run(
			"npm",
			["pack", "--json", "--ignore-scripts", "--pack-destination", root],
			{ cwd: packageRoot },
		);
		const [{ filename }] = JSON.parse(packed.stdout);
		const prefix = join(root, "consumer");
		await run(
			"npm",
			[
				"install",
				"--prefix",
				prefix,
				"--ignore-scripts",
				"--no-audit",
				"--no-fund",
				join(root, filename),
				"@earendil-works/pi-coding-agent@1.1.0",
				"@types/node@22",
				"@modelcontextprotocol/sdk@1",
			],
			{ maxBuffer: 8 * 1024 * 1024 },
		);
		const installed = join(prefix, "node_modules/@gyoungwe/pi-core");
		const pkg = JSON.parse(
			await readFile(join(installed, "package.json"), "utf8"),
		);
		assert.equal(pkg.version, "0.2.0");
		assert.equal(pkg.exports["./host"].types, "./dist/host.d.ts");
		await writeFile(
			join(prefix, "consumer.ts"),
			`
import { registerPiCore } from "@gyoungwe/pi-core";
import { coreHostLoader, taskHostLoader, normalizeTaskMilestones } from "@gyoungwe/pi-core/host";
import { writeMemory } from "@gyoungwe/pi-core/memory";
import { makeAskUserTool } from "@gyoungwe/pi-core/tools/ask-user";
import { makeDeliverFilesTool } from "@gyoungwe/pi-core/tools/deliver-files";
import { makeMemorySaveTool } from "@gyoungwe/pi-core/tools/memory-save";
import { makeStatusTool } from "@gyoungwe/pi-core/tools/status";
import { makeTodoTool } from "@gyoungwe/pi-core/tools/todo";
const verifier = taskHostLoader.load().readAcceptanceVerifier("paper");
const kind: string | undefined = verifier?.kind;
const normalized = normalizeTaskMilestones([{ id: "report", title: "Report", acceptance: { kind: "file", path: "report.md" } }], { kinds: ["file"], fields: {} });
const id: string = normalized[0].id;
void [registerPiCore, coreHostLoader, writeMemory, makeAskUserTool, makeDeliverFilesTool, makeMemorySaveTool, makeStatusTool, makeTodoTool, kind, id];
`,
		);
		await writeFile(
			join(prefix, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					noEmit: true,
					target: "ES2022",
					module: "ESNext",
					moduleResolution: "Bundler",
					skipLibCheck: false,
				},
				files: ["consumer.ts"],
			}),
		);
		execFileSync(
			join(workspaceRoot, "node_modules/.bin/tsc"),
			["-p", join(prefix, "tsconfig.json")],
			{ cwd: prefix, stdio: "inherit" },
		);
		for (const path of [
			"memory",
			"tools/ask-user",
			"tools/deliver-files",
			"tools/memory-save",
			"tools/status",
			"tools/todo",
		])
			await import(join(installed, `dist/${path}.mjs`));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
