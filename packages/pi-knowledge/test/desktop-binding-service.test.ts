import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import createDesktopRuntime from "../src/desktop/runtime.js";

// Other plugins (the managed task runtime) learn the current binding through the declared
// knowledge.binding service, never by reading the Vault or the binding file themselves.
const roots: string[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of closers.splice(0)) await close();
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function runtimeWith(binding: unknown) {
	const controller = new AbortController();
	closers.push(async () => controller.abort());
	const capabilities = {
		async call(name: string): Promise<unknown> {
			if (name === "state.readJson") return binding ? { kind: "value", value: binding } : { kind: "missing" };
			throw new Error(`Capability not provided: ${name}`);
		},
	};
	const runtime = await createDesktopRuntime({
		applicationId: "binding-test",
		resourcesLifecycle: { dispose: async () => undefined },
		resources: [{ kind: "state", handle: "state-root" }],
		signal: controller.signal,
		capabilities,
		events: { changed: () => undefined },
	} as unknown as Parameters<typeof createDesktopRuntime>[0]);
	closers.push(async () => runtime.dispose?.());
	const operation = runtime.operations?.binding;
	type Call = Parameters<NonNullable<typeof operation>["execute"]>[1];
	return () => operation?.execute(null, { capabilities, scope: { kind: "application" } } as unknown as Call);
}

it("the binding service returns the current Vault, its id and revision", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-binding-")));
	roots.push(root);
	await mkdir(join(root, "Vault"));
	const binding = await createKnowledgeConfigApi(undefined, join(root, "state")).saveKnowledgeBinding({
		vault: join(root, "Vault"),
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
	});
	const read = await runtimeWith(binding);
	expect(await read()).toEqual({ vaultId: binding.vaultId, revision: 1, vault: join(root, "Vault") });
});

it("the binding service returns null when no Vault is bound", async () => {
	const read = await runtimeWith(null);
	expect(await read()).toBeNull();
});

it("the manifest provides the binding service with exactly that operation", async () => {
	const manifest = JSON.parse(await readFile(new URL("../plugin.manifest.json", import.meta.url), "utf8"));
	expect(manifest.drone.provides).toEqual({ "knowledge.binding": { version: 1, operations: ["binding"] } });
});
