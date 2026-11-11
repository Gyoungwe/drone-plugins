import { normalizeZoteroDoi } from "../core/zotero-identity.js";
import type { CapabilityCall } from "./capability-fetch.js";

/** Prefer a named DOI allowance, otherwise an unused paper slot; the host enforces single use. */
export async function allowanceFor(
	call: CapabilityCall,
	doi: string,
	reservedSlots: Set<string>,
	signal?: AbortSignal,
): Promise<string | undefined> {
	let held: {
		allowances?: {
			id: string;
			member: string;
			consent: { doi?: unknown; slot?: boolean };
			used: boolean;
		}[];
	} | null;
	try {
		held = (await call("task.grant.allowances", null, signal)) as typeof held;
	} catch {
		return undefined;
	}
	const open = (held?.allowances ?? []).filter((item) => item.member === "zotero_item" && !item.used);
	const named = open.find((item) => normalizeZoteroDoi(item.consent?.doi) === doi);
	if (named) return named.id;
	const slot = open.find(
		(item) => item.consent?.slot === true && !item.consent?.doi && !reservedSlots.has(item.id),
	);
	if (slot) reservedSlots.add(slot.id);
	return slot?.id;
}
