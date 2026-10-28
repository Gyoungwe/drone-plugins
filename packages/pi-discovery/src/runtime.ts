import { createHash } from "node:crypto";
import type {
	PluginNativeRuntimeFactory,
	PluginNativeSession,
} from "@gyoungwe/plugin-api/native";
import type {
	PluginRuntimeRootDescription,
	PluginRuntimeScope,
	PluginStateReadResult,
} from "@gyoungwe/plugin-api/runtime";
import { DiscoveryService } from "./service.js";
import type { DiscoveryHostServices, DiscoveryJournalName } from "./ports.js";
import { JOURNALS, type JournalName } from "./native-records.js";
import { UnavailableKernelRunner } from "./domain/index.js";

const readMetadata = {
	drone: { readOnly: true, capabilities: ["research", "analysis"] },
};
const writeMetadata = { drone: { capabilities: ["research", "analysis"] } };
const bindingPath = "workspace-binding.json";
const nullSchema = { type: "null" } as const;
const objectSchema = { type: "object" } as const;
const bindingSchema = {
	type: "object",
	properties: {
		root: { type: "string", minLength: 1 },
		acknowledgeExistingData: { type: "boolean" },
	},
	required: ["root", "acknowledgeExistingData"],
	additionalProperties: false,
} as const;
export const planSchema = {
	type: "object",
	properties: {
		id: { type: "string", minLength: 1 },
		hypothesisId: { type: "string", minLength: 1 },
		prior: {
			type: "object",
			properties: {
				direction: { enum: ["positive", "negative", "none", "unknown"] },
				recordedAt: { type: "string" },
				confidence: { type: "number", minimum: 0, maximum: 1 },
				magnitude: { type: "number", minimum: 0 },
			},
			required: ["direction", "recordedAt"],
			additionalProperties: false,
		},
		budget: {
			type: "object",
			properties: {
				maxExecutions: { type: "integer", minimum: 1 },
				maxWallTimeMs: { type: "integer", minimum: 1 },
				maxOutputBytes: { type: "integer", minimum: 1 },
				maxCostUnits: { type: "number", exclusiveMinimum: 0 },
			},
			required: [
				"maxExecutions",
				"maxWallTimeMs",
				"maxOutputBytes",
				"maxCostUnits",
			],
			additionalProperties: false,
		},
		candidates: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string", minLength: 1 },
					statement: { type: "string", minLength: 1 },
					surprise: { type: "number", minimum: 0, maximum: 1 },
					estimatedCost: { type: "number", exclusiveMinimum: 0 },
					expectedExplanationsExcluded: { type: "number", minimum: 0 },
					credibility: { type: "number", minimum: 0, maximum: 1 },
				},
				required: [
					"id",
					"statement",
					"surprise",
					"estimatedCost",
					"expectedExplanationsExcluded",
					"credibility",
				],
				additionalProperties: false,
			},
		},
	},
	required: ["id", "hypothesisId", "prior", "budget", "candidates"],
	additionalProperties: false,
} as const;
export interface DiscoveryWorkspaceBinding {
	readonly schemaVersion: 1;
	readonly projectId: string;
	readonly workspaceId: string;
	readonly workspaceDirectory: string;
}
interface BoundRoot {
	readonly root: PluginRuntimeRootDescription;
	readonly binding: DiscoveryWorkspaceBinding | null;
	readonly hasExistingData: boolean;
}
function binding(value: unknown): DiscoveryWorkspaceBinding {
	const item = value as Partial<DiscoveryWorkspaceBinding> | null;
	if (
		!item ||
		item.schemaVersion !== 1 ||
		typeof item.workspaceId !== "string" ||
		typeof item.workspaceDirectory !== "string" ||
		typeof item.projectId !== "string"
	)
		throw new Error("Discovery workspace binding is malformed");
	return item as DiscoveryWorkspaceBinding;
}
function records(
	value: unknown,
	journal: JournalName,
): Record<string, unknown>[] {
	if (
		!Array.isArray(value) ||
		value.some(
			(item) => !item || typeof item !== "object" || Array.isArray(item),
		)
	)
		throw new Error(
			`Discovery journal ${journal} must contain an array of records`,
		);
	return value;
}
const response = (details: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(details) }],
	details,
});

/** One application owner; each live call resolves its canonical workspace through the host. */
export const createDiscoveryRuntime: PluginNativeRuntimeFactory = async ({
	capabilities,
	events,
}) => {
	const owners = new Map<string, { root: string; service: DiscoveryService }>();
	const caller = () =>
		capabilities.call("caller.scope", null) as Promise<PluginRuntimeScope>;
	const read = (root: string, path: string) =>
		capabilities.call("state.readJson", {
			root,
			path,
		}) as Promise<PluginStateReadResult>;
	const roots = async (): Promise<BoundRoot[]> => {
		const granted = (await capabilities.call(
			"roots.describe",
			null,
		)) as readonly PluginRuntimeRootDescription[];
		return Promise.all(
			granted
				.filter((item) => item.kind === "state")
				.map(async (root) => {
					const stored = await read(root.handle, bindingPath);
					const entries = (await capabilities.call("state.list", {
						root: root.handle,
						path: "",
					})) as readonly { name: string }[];
					return {
						root,
						binding: stored.kind === "missing" ? null : binding(stored.value),
						hasExistingData: entries.some((item) =>
							JOURNALS.some((name) => item.name === `${name}.json`),
						),
					};
				}),
		);
	};
	const workspace = async () => {
		const scope = await caller();
		if (scope.kind === "application")
			throw new Error("Select a real workspace session before using discovery");
		return scope;
	};
	const journalRecords = async (root: string, journal: JournalName) => {
		const stored = await read(root, `${journal}.json`);
		return stored.kind === "missing" ? [] : records(stored.value, journal);
	};
	const findRoot = async (
		scope: Exclude<PluginRuntimeScope, { kind: "application" }>,
	) => {
		const selected = (await roots()).filter(
			(item): item is BoundRoot & { binding: DiscoveryWorkspaceBinding } =>
				item.binding?.workspaceId === scope.workspaceId,
		);
		if (selected.length > 1)
			throw new Error(
				"More than one approved discovery root is bound to this workspace",
			);
		return selected[0];
	};
	const overview = async (preferredRoot?: string) => {
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
			status: journals.some((item) => item.count > 0)
				? "configured"
				: "unconfigured",
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
			inquiry: "unavailable",
		};
	};
	const owner = async (
		scope: Exclude<PluginRuntimeScope, { kind: "application" }>,
		root: BoundRoot & { binding: DiscoveryWorkspaceBinding },
	) => {
		let current = owners.get(scope.workspaceId);
		if (current) {
			if (current.root !== root.root.handle)
				throw new Error("Discovery workspace already owns another state root");
			await current.service.init();
			return current.service;
		}
		const journals = new Map<DiscoveryJournalName, string | null>();
		const services: DiscoveryHostServices = {
			journal: <T>(name: DiscoveryJournalName) => ({
				read: async () => {
					const stored = await read(root.root.handle, `${name}.json`);
					journals.set(name, stored.version);
					return (
						stored.kind === "missing" ? [] : records(stored.value, name)
					) as T[];
				},
				write: async (value: T[]) => {
					if (!journals.has(name)) {
						const stored = await read(root.root.handle, `${name}.json`);
						journals.set(name, stored.version);
					}
					const written = (await capabilities.call("state.writeJson", {
						root: root.root.handle,
						path: `${name}.json`,
						value,
						expectedVersion: journals.get(name),
					})) as PluginStateReadResult;
					journals.set(name, written.version);
					events.changed();
				},
			}),
			authorize: async () => {
				await capabilities.call("state.reserve", {
					root: root.root.handle,
					path: "",
				});
			},
			runner: async () => new UnavailableKernelRunner(),
			files: {
				prepareDirectory: async () => {
					throw new Error(
						"Controlled execution directory service is unavailable",
					);
				},
				write: async () => {
					throw new Error("Discovery export service is unavailable");
				},
			},
			onExecution: async () => {
				throw new Error("Discovery execution receipts are unavailable");
			},
			legacyJournal: async () => undefined,
		};
		const service = new DiscoveryService({
			projectId: root.binding.projectId,
			projectRoot: scope.workspaceDirectory,
			services,
		});
		current = { root: root.root.handle, service };
		owners.set(scope.workspaceId, current);
		await service.init().catch((error) => {
			owners.delete(scope.workspaceId);
			throw error;
		});
		return service;
	};
	const bind = async (input: {
		root: string;
		acknowledgeExistingData: boolean;
	}) => {
		const scope = await workspace();
		const selected = (await roots()).find(
			(item) => item.root.handle === input.root,
		);
		if (!selected || selected.root.access !== "read-write")
			throw new Error("Select an approved writable discovery state root");
		if (selected.binding && selected.binding.workspaceId !== scope.workspaceId)
			throw new Error("Discovery state belongs to another workspace");
		if (
			!selected.binding &&
			selected.hasExistingData &&
			!input.acknowledgeExistingData
		)
			throw new Error(
				"Existing discovery journals require explicit acknowledgement before binding",
			);
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
			if (unique.length > 1)
				throw new Error(
					"Existing discovery plans contain conflicting project identities",
				);
			const projectId =
				unique[0] ??
				`discovery-${createHash("sha256").update(scope.workspaceId).digest("hex").slice(0, 32)}`;
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
		if (
			verified.kind !== "value" ||
			binding(verified.value).workspaceId !== scope.workspaceId
		)
			throw new Error("Discovery workspace binding did not read back");
		await owner(scope, { ...selected, binding: binding(verified.value) });
		events.changed();
		return overview();
	};
	const list = async (input: {
		journal: JournalName;
		query?: string;
		root?: string;
	}) => {
		const scope = await workspace();
		const root = input.root
			? (await roots()).find((item) => item.root.handle === input.root)
			: await findRoot(scope);
		if (root?.binding && root.binding.workspaceId !== scope.workspaceId)
			throw new Error("Discovery state belongs to another workspace");
		if (!JOURNALS.includes(input.journal))
			throw new Error("Unknown discovery journal");
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
			? values.filter((value) =>
					JSON.stringify(value).toLocaleLowerCase().includes(query),
				)
			: values;
		return {
			readOnly: true,
			status: "configured",
			journal: input.journal,
			records: matches.slice(0, 32),
			count: matches.length,
			truncated: matches.length > 32,
		};
	};
	const createPlan = async (
		input: Parameters<DiscoveryService["createExplorationPlan"]>[0],
	) => {
		const scope = await workspace();
		const selected = await findRoot(scope);
		if (!selected)
			throw new Error(
				"Bind a discovery state directory before creating a plan",
			);
		await capabilities.call("state.reserve", {
			root: selected.root.handle,
			path: "",
		});
		return (await owner(scope, selected)).createExplorationPlan(input);
	};
	const journalSchema = { type: "string", enum: JOURNALS } as const;
	const operations = {
		overview: {
			inputSchema: nullSchema,
			resultSchema: objectSchema,
			effect: "read" as const,
			execute: () => overview(),
		},
		bindCurrentWorkspace: {
			inputSchema: bindingSchema,
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: (input: unknown) => bind(input as Parameters<typeof bind>[0]),
		},
		listRecords: {
			inputSchema: {
				type: "object",
				properties: {
					root: { type: "string" },
					journal: journalSchema,
					query: { type: "string", minLength: 1, maxLength: 2000 },
				},
				required: ["journal"],
				additionalProperties: false,
			},
			resultSchema: objectSchema,
			effect: "read" as const,
			execute: (input: unknown) => list(input as Parameters<typeof list>[0]),
		},
		createExplorationPlan: {
			inputSchema: planSchema,
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: (input: unknown) =>
				createPlan(input as Parameters<typeof createPlan>[0]),
		},
	};
	const createNativeSession = (): PluginNativeSession => ({
		toolEffects: {
			discovery_status: "read",
			discovery_list_records: "read",
			discovery_search_records: "read",
			discovery_bind_workspace: "write",
			discovery_create_plan: "write",
		},
		extension(pi) {
			pi.registerTool({
				name: "discovery_status",
				label: "Discovery · status",
				description:
					"Read approved discovery roots and current workspace journals; does not acquire writer ownership.",
				parameters: {
					type: "object",
					properties: { root: { type: "string" } },
					additionalProperties: false,
				},
				...readMetadata,
				async execute(_id, input) {
					return response(await overview((input as { root?: string }).root));
				},
			});
			for (const name of [
				"discovery_list_records",
				"discovery_search_records",
			] as const)
				pi.registerTool({
					name,
					label: "Discovery · records",
					description:
						"Read approved current-workspace discovery journal records; observations are not independent scientific validation.",
					parameters: operations.listRecords.inputSchema,
					...readMetadata,
					async execute(_id, input) {
						return response(await list(input as Parameters<typeof list>[0]));
					},
				});
			pi.registerTool({
				name: "discovery_bind_workspace",
				label: "Discovery · bind",
				description:
					"Explicitly bind an approved state directory to this real workspace, acknowledge any existing journals, and acquire exclusive writer ownership.",
				parameters: bindingSchema,
				...writeMetadata,
				async execute(_id, input) {
					return response(await bind(input));
				},
			});
			pi.registerTool({
				name: "discovery_create_plan",
				label: "Discovery · plan",
				description:
					"Persist a ranked exploration plan in the bound workspace. Does not execute code or certify scientific validity.",
				parameters: planSchema,
				...writeMetadata,
				async execute(_id, input) {
					return response(await createPlan(input));
				},
			});
		},
		dispose: async () => {},
	});
	return {
		operations,
		createNativeSession,
		async dispose() {
			await Promise.all(
				[...owners.values()].map((item) => item.service.dispose()),
			);
			owners.clear();
		},
	};
};
export default createDiscoveryRuntime;
