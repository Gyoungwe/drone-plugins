import { createHash } from "node:crypto";
import type {
	PluginRuntimeCapabilities,
	PluginRuntimeRootDescription,
	PluginRuntimeScope,
	PluginStateReadResult,
} from "@gyoungwe/plugin-api/runtime";
import type { DiscoveryLedgerInput } from "./domain/index.js";
import { JOURNALS, type JournalName } from "./native-records.js";
import {
	type BoundRoot,
	binding,
	type DiscoveryWorkspaceBinding,
	type RuntimeState,
	records,
	type WorkspaceOwnerLookup,
	type WorkspaceScope,
} from "./runtime-state.js";
import type { DiscoveryService } from "./service.js";

const bindingPath = "workspace-binding.json";
type Caller = () => Promise<PluginRuntimeScope>;
type Read = (root: string, path: string) => Promise<PluginStateReadResult>;
export type WorkspaceAccess = ReturnType<typeof createWorkspaceAccess>;
export type WorkspaceContext = RuntimeState & WorkspaceAccess & { owner: WorkspaceOwnerLookup };
export type WorkspaceOperations = ReturnType<typeof createWorkspaceOperations>;

export function createWorkspaceAccess(capabilities: PluginRuntimeCapabilities) {
	const caller = () => capabilities.call("caller.scope", null) as Promise<PluginRuntimeScope>;
	const read = (root: string, path: string) =>
		capabilities.call("state.readJson", { root, path }) as Promise<PluginStateReadResult>;
	const roots = () => describeRoots(capabilities, read);
	const workspace = () => currentWorkspace(caller);
	const journalRecords = (root: string, journal: JournalName) => readJournal(read, root, journal);
	const findRoot = (scope: WorkspaceScope) => findWorkspaceRoot(roots, scope);
	return { caller, read, roots, workspace, journalRecords, findRoot };
}

export function createWorkspaceOperations(context: WorkspaceContext) {
	const overview = (preferredRoot?: string) => readOverview(context, preferredRoot);
	const bind = (input: { root: string; acknowledgeExistingData: boolean }) =>
		bindWorkspace({ ...context, overview }, input);
	const list = (input: { journal: JournalName; query?: string; root?: string }) =>
		listRecords(context, input);
	const createPlan = (input: Parameters<DiscoveryService["createExplorationPlan"]>[0]) =>
		createExplorationPlan(context, input);
	const recordInquiry = (input: DiscoveryLedgerInput) => recordDiscoveryInquiry(context, input);
	return { overview, bind, list, createPlan, recordInquiry };
}

async function describeRoots(capabilities: PluginRuntimeCapabilities, read: Read): Promise<BoundRoot[]> {
	const granted = (await capabilities.call(
		"roots.describe",
		null,
	)) as readonly PluginRuntimeRootDescription[];
	return Promise.all(
		granted
			.filter((item) => item.kind === "state")
			.map(async (root) => {
				const stored = await read(root.handle, bindingPath);
				// A saved binding is already existing state; only unbound roots need a journal inventory for adoption.
				const entries =
					stored.kind === "missing"
						? ((await capabilities.call("state.list", {
								root: root.handle,
								path: "",
							})) as readonly { name: string }[])
						: [];
				return {
					root,
					binding: stored.kind === "missing" ? null : binding(stored.value),
					hasExistingData:
						stored.kind === "value" ||
						entries.some((item) => JOURNALS.some((name) => item.name === `${name}.json`)),
				};
			}),
	);
}

async function currentWorkspace(caller: Caller) {
	const scope = await caller();
	if (scope.kind === "application") throw new Error("Select a real workspace session before using discovery");
	return scope;
}

async function readJournal(read: Read, root: string, journal: JournalName) {
	const stored = await read(root, `${journal}.json`);
	return stored.kind === "missing" ? [] : records(stored.value, journal);
}

async function findWorkspaceRoot(roots: WorkspaceAccess["roots"], scope: WorkspaceScope) {
	const selected = (await roots()).filter(
		(item): item is BoundRoot & { binding: DiscoveryWorkspaceBinding } =>
			item.binding?.workspaceId === scope.workspaceId,
	);
	if (selected.length > 1)
		throw new Error("More than one approved discovery root is bound to this workspace");
	return selected[0];
}

async function readOverview(
	{ caller, roots, owners, journalRecords, capabilities }: WorkspaceContext,
	preferredRoot?: string,
) {
	const scope = await caller();
	const available = await roots();
	const selected =
		scope.kind === "application"
			? undefined
			: available.find(
					(item) =>
						item.binding?.workspaceId === scope.workspaceId ||
						(!item.binding && item.root.handle === preferredRoot),
				);
	const journals = selected
		? await Promise.all(
				JOURNALS.map(async (journal) => ({
					journal,
					count: (await journalRecords(selected.root.handle, journal)).length,
				})),
			)
		: [];
	return {
		scope,
		readOnly: true,
		status: journals.some((item) => item.count > 0) ? "configured" : "unconfigured",
		readiness:
			scope.kind === "application"
				? "select-session"
				: selected?.binding
					? owners.has(scope.workspaceId)
						? "ready"
						: "needs-ownership"
					: "needs-binding",
		roots: available,
		journals,
		execution: "unavailable",
		inquiry: await capabilities.call("provider.inspect", { alias: "inquiry" }),
	};
}

async function bindWorkspace(
	{
		workspace,
		roots,
		capabilities,
		read,
		journalRecords,
		owner,
		events,
		overview,
	}: WorkspaceContext & { overview: (preferredRoot?: string) => ReturnType<typeof readOverview> },
	input: { root: string; acknowledgeExistingData: boolean },
) {
	const scope = await workspace();
	const selected = (await roots()).find((item) => item.root.handle === input.root);
	if (!selected || selected.root.access !== "read-write")
		throw new Error("Select an approved writable discovery state root");
	if (selected.binding && selected.binding.workspaceId !== scope.workspaceId)
		throw new Error("Discovery state belongs to another workspace");
	if (!selected.binding && selected.hasExistingData && !input.acknowledgeExistingData)
		throw new Error("Existing discovery journals require explicit acknowledgement before binding");
	await capabilities.call("state.reserve", { root: input.root, path: "" });
	const stored = await read(input.root, bindingPath);
	if (stored.kind === "value") {
		if (binding(stored.value).workspaceId !== scope.workspaceId)
			throw new Error("Discovery state belongs to another workspace");
	} else {
		const plans = await journalRecords(input.root, "plans");
		const ids = plans.map((plan) => {
			if (typeof plan.projectId !== "string")
				throw new Error("Existing discovery plan has no project identity");
			return plan.projectId;
		});
		const unique = [...new Set(ids)];
		if (unique.length > 1) throw new Error("Existing discovery plans contain conflicting project identities");
		const projectId =
			unique[0] ?? `discovery-${createHash("sha256").update(scope.workspaceId).digest("hex").slice(0, 32)}`;
		await capabilities.call("state.writeJson", {
			root: input.root,
			path: bindingPath,
			value: {
				schemaVersion: 1,
				projectId,
				workspaceId: scope.workspaceId,
				workspaceDirectory: scope.workspaceDirectory,
			},
			expectedVersion: null,
		});
	}
	const verified = await read(input.root, bindingPath);
	if (verified.kind !== "value" || binding(verified.value).workspaceId !== scope.workspaceId)
		throw new Error("Discovery workspace binding did not read back");
	await owner(scope, { ...selected, binding: binding(verified.value) });
	events.changed();
	return overview();
}

async function listRecords(
	{ workspace, roots, findRoot, journalRecords }: WorkspaceContext,
	input: { journal: JournalName; query?: string; root?: string },
) {
	const scope = await workspace();
	const root = input.root
		? (await roots()).find((item) => item.root.handle === input.root)
		: await findRoot(scope);
	if (root?.binding && root.binding.workspaceId !== scope.workspaceId)
		throw new Error("Discovery state belongs to another workspace");
	if (!JOURNALS.includes(input.journal)) throw new Error("Unknown discovery journal");
	if (!root)
		return {
			readOnly: true,
			status: "unconfigured",
			journal: input.journal,
			records: [],
			count: 0,
			truncated: false,
		};
	const values = await journalRecords(root.root.handle, input.journal);
	const query = input.query?.trim().toLocaleLowerCase();
	const matches = query
		? values.filter((value) => JSON.stringify(value).toLocaleLowerCase().includes(query))
		: values;
	return {
		readOnly: true,
		status: "configured",
		journal: input.journal,
		records: matches.slice(0, 32),
		count: matches.length,
		truncated: matches.length > 32,
	};
}

async function createExplorationPlan(
	{ workspace, findRoot, capabilities, owner }: WorkspaceContext,
	input: Parameters<DiscoveryService["createExplorationPlan"]>[0],
) {
	const scope = await workspace();
	const selected = await findRoot(scope);
	if (!selected) throw new Error("Bind a discovery state directory before creating a plan");
	await capabilities.call("state.reserve", {
		root: selected.root.handle,
		path: "",
	});
	return (await owner(scope, selected)).service.createExplorationPlan(input);
}

async function recordDiscoveryInquiry(
	{ workspace, findRoot, owner }: WorkspaceContext,
	input: DiscoveryLedgerInput,
) {
	const scope = await workspace(),
		root = await findRoot(scope);
	if (!root) throw new Error("Bind the Discovery state root first");
	await (await owner(scope, root)).service.recordDiscovery(input);
	return { recorded: true, authority: "plugin-asserted-or-imported" };
}
