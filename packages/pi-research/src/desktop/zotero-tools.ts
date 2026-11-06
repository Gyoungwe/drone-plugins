import { ZOTERO_ITEM_TYPES } from "../core/zotero-write.js";
import {
	executeZoteroSave,
	executeZoteroUpdate,
	prepareZoteroSave,
	prepareZoteroUpdate,
	probeZoteroConnector,
	receiptWithoutUpdate,
	receiptWithoutWrite,
} from "../core/zotero-write-runtime.js";
import { normalizeZoteroDoi } from "../core/zotero-identity.js";
import { type CapabilityCall, capabilityFetch } from "./capability-fetch.js";

/**
 * Zotero tools in the Drone Desktop managed runtime. Every request goes through the host's network
 * capabilities; the host's write dialog is the only confirmation (the managed session has no UI of its
 * own), so these tools ask no question themselves.
 */

/** Zotero desktop connector endpoints that only read. Must equal the manifest's `drone.networkReads`. */
export const ZOTERO_NETWORK_READS = Object.freeze([
	"127.0.0.1:23119/connector/ping",
	"127.0.0.1:23119/connector/getSelectedCollection",
]);
/** The managed runtime holds no Zotero credentials yet: Web API and Zotero 10 local writes stay blocked. */
const NO_CREDENTIALS = Object.freeze({});
const MANAGED_LIMITS =
	"In Drone Desktop this tool has no Zotero credentials yet: saving goes through Zotero desktop (the connector) and is read back through its local API; the Web API and changing existing items are unavailable.";

const text = (value: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
	details: value,
});

/** A call whose network writes are observed, so a write the user declined is not reported as a failure. */
function observedWrites(call: CapabilityCall) {
	const state = { wrote: false, declined: false };
	const observed: CapabilityCall = async (name, input, signal) => {
		try {
			const result = await call(name, input, signal);
			if (name === "network.write") state.wrote = true;
			return result;
		} catch (error) {
			if (name === "network.write" && /denied/i.test((error as Error).message)) state.declined = true;
			throw error;
		}
	};
	return { call: observed, declinedBeforeAnyWrite: () => state.declined && !state.wrote };
}

/**
 * The allowance the user's task authorization gave this package for a DOI: the milestone naming it, else an
 * unused "one paper after close reading" slot. Without one the host asks as usual.
 */
async function allowanceFor(call: CapabilityCall, doi: string, signal?: AbortSignal): Promise<string | undefined> {
	let held: { allowances?: { id: string; member: string; consent: any; used: boolean }[] } | null;
	try {
		held = (await call("task.grant.allowances", null, signal)) as typeof held;
	} catch {
		return undefined;
	}
	const open = (held?.allowances ?? []).filter((item) => item.member === "zotero_item" && !item.used);
	const named = open.find((item) => normalizeZoteroDoi(item.consent?.doi) === doi);
	return (named ?? open.find((item) => item.consent?.slot === true && !item.consent?.doi))?.id;
}

export async function saveToZotero(call: CapabilityCall, params: Record<string, any>, signal?: AbortSignal) {
	const plan = await prepareZoteroSave(params, {
		fetchImpl: capabilityFetch(call, { reads: ZOTERO_NETWORK_READS }),
		env: NO_CREDENTIALS,
		signal,
	});
	let receipt: Record<string, any>;
	let allowance: string | undefined;
	if (plan.action !== "create") receipt = receiptWithoutWrite(plan);
	else {
		const writes = observedWrites(call);
		allowance = await allowanceFor(call, plan.doi, signal);
		receipt = await executeZoteroSave(plan, {
			fetchImpl: capabilityFetch(writes.call, {
				reads: ZOTERO_NETWORK_READS,
				summary: `写入 Zotero 文献库：《${plan.item.title}》（DOI ${plan.doi}）`,
				allowance,
			}),
			env: NO_CREDENTIALS,
			signal,
		});
		if (writes.declinedBeforeAnyWrite())
			receipt = receiptWithoutWrite({ ...plan, action: "cancelled", reason: "user-declined" });
	}
	receipt.consent = allowance ? { via: "task-grant", milestoneId: allowance } : { via: "host-dialog" };
	if (receipt.status === "reused" && params.attachment_url)
		receipt.update = "The item already exists, so nothing was changed.";
	receipt.next = receipt.zoteroKey
		? `research_deposit_knowledge type=paper zotero_key=${receipt.zoteroKey} doi=${receipt.doi}, then research_verify_literature.`
		: "Do not retry automatically. Inspect Zotero or ask the user before any further write.";
	return receipt;
}

export async function updateInZotero(
	call: CapabilityCall,
	params: Record<string, any>,
	cwd: string,
	signal?: AbortSignal,
) {
	const plan = await prepareZoteroUpdate(params, {
		fetchImpl: capabilityFetch(call, { reads: ZOTERO_NETWORK_READS }),
		env: NO_CREDENTIALS,
		cwd,
		signal,
	});
	if (plan.action !== "update") return { ...receiptWithoutUpdate(plan), consent: { via: "not-needed" } };
	const writes = observedWrites(call);
	const receipt = await executeZoteroUpdate(plan, {
		fetchImpl: capabilityFetch(writes.call, {
			reads: ZOTERO_NETWORK_READS,
			summary: `修改 Zotero 条目 ${plan.item.key}`,
		}),
		env: NO_CREDENTIALS,
		signal,
	});
	if (writes.declinedBeforeAnyWrite())
		return { ...receiptWithoutUpdate({ ...plan, action: "cancelled", reason: "user-declined" }), consent: { via: "host-dialog" } };
	return { ...receipt, consent: { via: "host-dialog" } };
}

export async function zoteroStatus(call: CapabilityCall, signal?: AbortSignal) {
	return {
		runtime: "drone-desktop-managed",
		connector: await probeZoteroConnector({
			fetchImpl: capabilityFetch(call, { reads: ZOTERO_NETWORK_READS }),
			signal,
		}),
		webApi: { configured: false, reason: "managed-runtime-has-no-credentials" },
		localWrite: { configured: false, reason: "managed-runtime-has-no-credentials" },
		note: MANAGED_LIMITS,
	};
}

/** Every tool declares read: the only write is the host's own dialog for each network write. */
export const ZOTERO_TOOL_EFFECTS = Object.freeze({
	research_zotero_status: "read",
	research_zotero_save: "read",
	research_zotero_update: "read",
} as const);

export function registerManagedZoteroTools(pi: { registerTool(tool: unknown): void }, call: CapabilityCall) {
	pi.registerTool({
		name: "research_zotero_status",
		label: "Zotero literature status",
		description: `Read-only: report whether Zotero desktop is reachable and which write channels are available. ${MANAGED_LIMITS}`,
		parameters: { type: "object", properties: {}, additionalProperties: false },
		execute: async (_id: string, _params: unknown, signal?: AbortSignal) => text(await zoteroStatus(call, signal)),
	});
	pi.registerTool({
		name: "research_zotero_save",
		label: "Save one paper to Zotero (host-controlled)",
		description: `Write ONE bibliographic item into the user's Zotero library, keyed by exact DOI. Dedups by DOI first (an existing item is reused, nothing is written); otherwise the host asks the user once on its own dialog, writes once and reads the item back by DOI. Never deletes, merges or retries; never ask the user for confirmation in chat. ${MANAGED_LIMITS}`,
		parameters: {
			type: "object",
			required: ["doi", "title"],
			properties: {
				doi: { type: "string", description: "Exact DOI, e.g. 10.1038/s41586-020-2649-2" },
				title: { type: "string" },
				item_type: { type: "string", enum: [...ZOTERO_ITEM_TYPES], description: "Zotero item type; default journalArticle." },
				creators: {
					type: "array",
					description: "Authors in order. Use last_name/first_name, or name for organisations.",
					items: {
						type: "object",
						properties: {
							last_name: { type: "string" },
							first_name: { type: "string" },
							name: { type: "string" },
							creator_type: { type: "string", description: "author (default), editor, contributor" },
						},
					},
				},
				date: { type: "string" },
				publication: { type: "string", description: "Journal, proceedings, book or repository title." },
				volume: { type: "string" },
				issue: { type: "string" },
				pages: { type: "string" },
				url: { type: "string" },
				abstract: { type: "string" },
				tags: { type: "array", items: { type: "string" } },
				attachment_url: {
					type: "string",
					description: "Optional http(s) URL of an open-access PDF whose license allows saving; Zotero desktop downloads it.",
				},
				attachment_title: { type: "string" },
				target: {
					type: "string",
					description:
						'"L<libraryID>" or "C<collectionID>" as reported by Zotero desktop. Default: the library/collection currently selected in Zotero.',
				},
			},
		},
		execute: async (_id: string, params: Record<string, any>, signal?: AbortSignal) =>
			text(await saveToZotero(call, { ...(params || {}), channel: "connector" }, signal)),
	});
	pi.registerTool({
		name: "research_zotero_update",
		label: "Update an existing Zotero item (host-controlled)",
		description: `Change ONE existing item in the user's Zotero library (collection, PDF link, local PDF). Identify it by zotero_key or exact DOI; the host asks the user on its own dialog before writing, then reads the item back. Never deletes or retries. Without a write channel it returns status=blocked with the reason; never ask for a key in chat. ${MANAGED_LIMITS}`,
		parameters: {
			type: "object",
			properties: {
				zotero_key: { type: "string", description: "8-character key of the existing item (preferred)." },
				doi: { type: "string", description: "Exact DOI when the key is unknown; must match exactly one item." },
				collection_key: { type: "string", description: "8-character key of the collection to add the item to." },
				collection_name: { type: "string", description: "Exact collection name, used when the key is unknown." },
				attachment_url: { type: "string", description: "http(s) URL of an open-access PDF to attach as a link." },
				attachment_title: { type: "string" },
				local_file: { type: "string", description: "Path (inside the project) of a PDF to upload as a stored attachment." },
			},
		},
		execute: async (
			_id: string,
			params: Record<string, any>,
			signal: AbortSignal | undefined,
			_update: unknown,
			ctx: { cwd: string },
		) => text(await updateInZotero(call, params || {}, ctx.cwd, signal)),
	});
}
