import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import createDesktopRuntime from "../src/desktop/runtime.js";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

// Host child facts carry no root or grant. The package decides from its own binding
// what a read-only child may see, and never offers write commands to a child.

async function harness(subagentPolicy: "none" | "read-local") {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-child-")));
	roots.push(root);
	await mkdir(join(root, "Vault"));
	const binding = await createKnowledgeConfigApi(undefined, join(root, "state"))
		.saveKnowledgeBinding({ vault: join(root, "Vault"), profile: "hybrid", depositMode: "verified", subagentPolicy });
	const calls: string[] = [];
	const capabilities = {
		async call(name: string): Promise<unknown> {
			calls.push(name);
			if (name === "state.readJson")
				return { kind: "value", value: binding };
			throw new Error(`Capability not provided: ${name}`);
		},
	};
	return { calls, capabilities };
}

async function register(subagentPolicy: "none" | "read-local", facts: any) {
	const { calls, capabilities } = await harness(subagentPolicy);
	const controller = new AbortController();
	const runtime = await createDesktopRuntime({
		applicationId: "child-test",
		resourcesLifecycle: { dispose: async () => {} },
		resources: [{ kind: "state", handle: "state-root" }],
		signal: controller.signal,
		capabilities,
		events: { changed: () => {} },
	} as any);
	calls.length = 0;
	const session = await runtime.createNativeSession!(facts);
	const readsBeforeRegistration = [...calls];
	const tools: string[] = [];
	const commands: string[] = [];
	const events = new Set<string>();
	await session.extension({
		events: createEventBus(),
		on: (name: string) => events.add(name),
		registerTool: (tool: any) => tools.push(tool.name),
		registerCommand: (name: string) => commands.push(name),
		appendEntry: () => undefined,
		getCommands: () => [],
	} as any);
	await session.dispose();
	await runtime.dispose();
	controller.abort();
	return { session, readsBeforeRegistration, tools, commands, events: [...events] };
}

it("a child without file access only labels its answer and never reads the Vault binding", async () => {
	const child = await register("read-local", { kind: "child", readOnly: true, files: "none" });
	expect(child.readsBeforeRegistration).toEqual([]);
	expect(child.tools).toEqual([]);
	expect(child.commands).toEqual([]);
	expect(child.session.toolEffects).toEqual({});
	expect(child.session.commandEffects).toEqual({});
	expect(child.session.projection?.finalize).toBeTypeOf("function");
	for (const event of child.events) if (event !== "session_shutdown") expect(child.session.eventEffects?.[event]).toBe("read");
});

it("a child with read access stays evidence-only when this package's policy is none", async () => {
	const child = await register("none", { kind: "child", readOnly: true, files: "read" });
	expect(child.readsBeforeRegistration).toEqual(["state.readJson"]);
	expect(child.tools).toEqual([]);
	expect(child.commands).toEqual([]);
});

it("a read-local child gets the read-only interface and no write command", async () => {
	const child = await register("read-local", { kind: "child", readOnly: true, files: "read" });
	const manifest = JSON.parse(await readFile(new URL("../plugin.manifest.json", import.meta.url), "utf8"));
	expect(child.tools).toEqual(expect.arrayContaining(["knowledge_status", "knowledge_search"]));
	for (const tool of child.tools) expect(manifest.tools).toContain(tool);
	expect(child.commands).toEqual([]);
	expect(Object.values(child.session.toolEffects ?? {})).not.toContain("write");
	// Every hook the read-only interface registers is declared read: a child session cannot obtain write effects.
	for (const event of child.events) if (event !== "session_shutdown") expect(child.session.eventEffects?.[event]).toBe("read");
});

it("the primary session keeps its full interface and write commands", async () => {
	const primary = await register("read-local", { kind: "primary", readOnly: false });
	expect(primary.commands).toEqual(expect.arrayContaining(["knowledge-review-model", "knowledge-migrate-recovery"]));
});
