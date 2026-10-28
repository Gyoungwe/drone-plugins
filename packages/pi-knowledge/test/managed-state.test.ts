import { expect, it } from "vitest";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createTopicMemoryApi } from "../src/core/topic-memory.js";
import { createKnowledgeSpecialistHost } from "../src/core/specialist-host.js";
import { createKnowledgeUi } from "../src/core/ui-state.js";
import { createBrokerTopicMemoryStorage } from "../src/desktop/topic-storage.js";
import { createBrokerSpecialistSettingsStorage } from "../src/desktop/specialist-settings-storage.js";
import type { WikiReviewPorts } from "../src/core/wiki-review-ports.js";

function stateStore() {
	const values = new Map<string, { value: unknown; version: string }>();
	let sequence = 0;
	const state: WikiReviewPorts["state"] = {
		async read(path) { return structuredClone(values.get(path) ?? null); },
		async write(path, value, expectedVersion) {
			if ((values.get(path)?.version ?? null) !== expectedVersion) throw new Error("state changed");
			values.set(path, { value: structuredClone(value), version: String(++sequence) });
		},
		async list() { return []; },
		async remove(path, expectedVersion) {
			if (values.get(path)?.version !== expectedVersion) throw new Error("state changed");
			values.delete(path);
		},
	};
	return { state, values };
}
const binding = { version: 1 as const, vault: "/actual-granted-vault", vaultId: "a".repeat(24), revision: 1, profile: "hybrid" as const, depositMode: "verified" as const, subagentPolicy: "none" as const, updatedAt: "2026-10-28" };

it("uses topic storage without a synthetic OS directory and refuses corrupt persisted state", async () => {
	const { state, values } = stateStore();
	const topics = createTopicMemoryApi(createKnowledgeRuntimeHost(), undefined, createBrokerTopicMemoryStorage({
		state,
		files: { async read() { throw new Error("No source read requested"); }, async write() { throw new Error("No Vault write requested"); }, async remove() { throw new Error("No Vault removal requested"); } },
	}));
	const memory = topics.createTopicMemory({ binding, project: "project" });
	expect((await memory.list()).revision).toBe(0);
	values.set(`${binding.vaultId}/topic-memory/project.json`, { value: { corrupt: true }, version: "1" });
	await expect(memory.list()).rejects.toThrow("refusing overwrite");
	expect(values.get(`${binding.vaultId}/topic-memory/project.json`)?.value).toEqual({ corrupt: true });
});

it("keeps specialist configuration validation and optimistic revision checks on broker state", async () => {
	const { state } = stateStore();
	const specialists = createKnowledgeSpecialistHost(createKnowledgeRuntimeHost(), {
		async readKnowledgeBinding() { return binding; },
		async withKnowledgeBinding(_binding, work) { return work(); },
	}, { invalidateKnowledgeUi() {} }, createBrokerSpecialistSettingsStorage(state));
	expect(await specialists.specialistSettings()).toMatchObject({ mode: "automatic", revision: 0 });
	await specialists.setSpecialistSettings({ mode: "manual", revision: 0, bindingRevision: 1 });
	expect(await specialists.specialistSettings()).toMatchObject({ mode: "manual", revision: 1 });
	await expect(specialists.setSpecialistSettings({ mode: "off", revision: 0, bindingRevision: 1 })).rejects.toThrow("settings changed");
	await specialists.dispose();
});

it("awaits metrics persistence and serializes two sessions without losing a counted answer", async () => {
	const { state } = stateStore();
	const ui = createKnowledgeUi(createKnowledgeRuntimeHost(), undefined, {
		read: () => state.read("answer-metrics.json"),
		write: (value, version) => state.write("answer-metrics.json", value, version),
	});
	const first = { sessionId: "first" }, second = { sessionId: "second" };
	for (const context of [first, second]) {
		ui.beginKnowledgeFlow(context, binding);
		ui.updateKnowledgeFlow(context, { search: { hits: 1 } });
	}
	await Promise.all([ui.publicationKnowledgeFlow(first, { status: "released" }), ui.publicationKnowledgeFlow(second, { status: "released" })]);
	expect((await state.read("answer-metrics.json"))?.value).toMatchObject({ answered: 2, total: 2, rate: 1 });
	await ui.publicationKnowledgeFlow(first, { status: "released" });
	expect((await state.read("answer-metrics.json"))?.value).toMatchObject({ answered: 2, total: 2 });
});


it("does not mark or double-count an answer when the authorized metrics write fails", async () => {
	const { state } = stateStore();
	let denied = true;
	const ui = createKnowledgeUi(createKnowledgeRuntimeHost(), undefined, {
		read: () => state.read("answer-metrics.json"),
		async write(value, version) {
			if (denied) throw new Error("write denied");
			await state.write("answer-metrics.json", value, version);
		},
	});
	const context = { sessionId: "failed" };
	ui.beginKnowledgeFlow(context, binding);
	ui.updateKnowledgeFlow(context, { search: { hits: 1 } });
	await expect(ui.publicationKnowledgeFlow(context, { status: "released" })).rejects.toThrow("write denied");
	expect(await state.read("answer-metrics.json")).toBeNull();
	denied = false;
	await ui.publicationKnowledgeFlow(context, { status: "released" });
	expect((await state.read("answer-metrics.json"))?.value).toMatchObject({ answered: 1, total: 1 });
});
