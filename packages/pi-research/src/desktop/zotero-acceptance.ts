import type { PluginRuntimeOperation } from "@gyoungwe/plugin-api/runtime";
import { isValidZoteroDoi, normalizeZoteroDoi } from "../core/zotero-identity.js";
import { createLocalZoteroReconciler } from "../core/zotero-reconcile-runtime.js";
import { type CapabilityCall, capabilityFetch } from "./capability-fetch.js";

/**
 * The `zotero_item` task acceptance in the Drone Desktop managed runtime, provided as the service
 * `task.acceptance:zotero_item` (the task plugin consumes the role `task.acceptance:`). Everything runs
 * here, in this package's owner: the task plugin sends JSON and caches only the text it gets back.
 * Reading back is read-only and goes through the host's `network.read` to the Zotero desktop local API.
 */
export const ZOTERO_ACCEPTANCE_SERVICE = "task.acceptance:zotero_item";
export const ZOTERO_ACCEPTANCE_OPERATIONS = Object.freeze(["describe", "verify", "identify"]);

const FIELDS = Object.freeze(["doi", "libraryId", "collection"]);
const EVIDENCE_KIND = "zotero-read-only-item-identity";
const ZOTERO_KEY = /^[A-Z0-9]{8}$/;
const SAVE_BOUND_STATUSES = new Set(["saved", "reused"]);

type Acceptance = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Static shape with `null`; per milestone the label, the consent entry and the "what's missing" hint. */
export function describeZoteroAcceptance(acceptance: Acceptance | null) {
	if (!acceptance) return { fields: [...FIELDS], evidenceKind: EVIDENCE_KIND };
	const doi = text(acceptance.doi);
	return {
		fields: [...FIELDS],
		evidenceKind: EVIDENCE_KIND,
		label: doi
			? `文献进入 Zotero（${doi}）`
			: "文献进入 Zotero（本任务精读后写入的一篇；写入时不再单独询问）",
		// A milestone without a DOI is a slot: "one paper written after close reading".
		consent: {
			...(doi ? { doi } : { slot: true }),
			libraryId: text(acceptance.libraryId) || null,
			collection: text(acceptance.collection) || null,
		},
		pending: doi
			? {
					reason: `Zotero 里还没有读回这条文献（${doi}）的身份`,
					next: "先用 research_zotero_save 写入并核对，再继续；若这个 DOI 本身不对，用 task_wait kind=rebind 请用户确认换成真实文献",
				}
			: {
					reason: "这一项还没有对应的文献：精读后写入 Zotero 的回执会把 DOI 绑定过来",
					next: "对精读过的每篇调用 research_zotero_save，读回后自动绑定并验收",
				},
	};
}

/** Read-only evidence row: summary, note and an "open in Zotero" link. The task plugin knows no Zotero. */
export function describeZoteroEvidence(result: Record<string, any>): Record<string, any> {
	const key = ZOTERO_KEY.test(result?.itemId || "") ? result.itemId : null;
	const state = result?.state || "unknown";
	const summary =
		state === "found" && key
			? `Zotero 已找到条目 ${key}`
			: state === "not-found"
				? "Zotero 中未找到该 DOI"
				: state === "ambiguous"
					? "Zotero 中有多条同 DOI 条目"
					: `Zotero 暂不可核对：${result?.reason || state}`;
	const pdf = (result?.attachments || []).some((a: any) => a?.contentType === "application/pdf");
	const note = state === "found" ? `本机 · ${pdf ? "有 PDF 附件（未读）" : "仅元数据"}` : null;
	return {
		...result,
		summary,
		note,
		links: key
			? [
					{
						kind: "resource",
						target: `zotero://select/library/items/${key}`,
						label: "在 Zotero 中打开",
						i18n: "flow.link.openInZotero",
					},
				]
			: [],
	};
}

/** A save receipt becomes the identity of a DOI-less milestone only when this package read it back. */
export function identifyZoteroReceipt(event: Record<string, any>) {
	if (event?.toolName !== "research_zotero_save" || event.isError) return null;
	const receipt = event.result?.details;
	if (!receipt || typeof receipt !== "object") return null;
	if (!SAVE_BOUND_STATUSES.has(receipt.status) || !ZOTERO_KEY.test(receipt.zoteroKey || "")) return null;
	const doi = normalizeZoteroDoi(receipt.doi);
	return doi && isValidZoteroDoi(doi) ? { doi } : null;
}

export function verifyZoteroAcceptance(
	call: CapabilityCall,
	acceptance: Acceptance,
	signal?: AbortSignal,
): Promise<Record<string, any>> {
	if (!text(acceptance.doi))
		return Promise.resolve({ state: "pending", reason: "doi-unbound", summary: "还没有文献绑定到这一项" });
	const send = capabilityFetch(call);
	// The reconciler sets its own timeout; the caller's cancellation also applies.
	const fetchImpl: typeof fetch = (input, init) =>
		send(input, { ...init, signal: AbortSignal.any([init?.signal, signal].filter((s): s is AbortSignal => !!s)) });
	const reconcile = createLocalZoteroReconciler({ fetchImpl });
	return reconcile(acceptance).then(describeZoteroEvidence);
}

const acceptanceInput = { anyOf: [{ type: "null" }, { type: "object" }] };

/** Runtime operations behind `provider.read({ role, member: "zotero_item", operation })`. */
export function zoteroAcceptanceOperations(): Record<"describe" | "verify", PluginRuntimeOperation> {
	return {
		describe: {
			effect: "read",
			inputSchema: acceptanceInput,
			resultSchema: { type: "object" },
			execute: async input => describeZoteroAcceptance((input as Acceptance | null) ?? null),
		},
		verify: {
			effect: "read",
			inputSchema: { type: "object" },
			resultSchema: { type: "object" },
			execute: async (input, invocation) =>
				verifyZoteroAcceptance(
					(name, value, signal) => invocation.capabilities.call(name, value, signal),
					input as Acceptance,
					invocation.signal,
				),
		},
	};
}

/** `provider.native` receiver: the host hands over the actual tool_execution_end event, never caller JSON. */
export const zoteroIdentifyNativeOperation = Object.freeze({
	event: "tool_execution_end",
	effect: "read",
	inputSchema: { type: "null" },
	resultSchema: { anyOf: [{ type: "null" }, { type: "object" }] },
	execute: async (_input: unknown, actual: Record<string, any>) => identifyZoteroReceipt(actual),
});
