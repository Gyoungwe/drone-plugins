import type {
	PluginProviderEnumeration,
	PluginProviderInvocationInput,
	PluginRuntimeCapabilities,
} from "@gyoungwe/plugin-api/runtime";
import {
	type Acceptance,
	type AcceptanceMilestone,
	effectiveAcceptance,
	registerAcceptanceVerifier,
} from "./acceptance.ts";
import type { RemainingTask, WorkbenchMilestone } from "./remaining.ts";

interface ProviderDescription {
	fields?: readonly string[];
	evidenceKind?: string;
	operationVerifier?: string;
	label?: string;
	consent?: unknown;
	pending?: unknown;
}

type ProviderCall = PluginRuntimeCapabilities["call"];
type RemoteKinds = Map<string, { cache: Map<string, ProviderDescription>; fields: string[] }>;

const ROLE = "acceptance";
const CACHE_LIMIT = 256;
const keyOf = (acceptance: Acceptance) =>
	JSON.stringify(
		Object.keys(acceptance || {})
			.sort()
			.map((key) => [key, acceptance[key]]),
	);
const address = (member: string, operation: string, input: unknown): PluginProviderInvocationInput => ({
	role: ROLE,
	member,
	operation,
	input,
});

function registerRemoteVerifier(
	call: ProviderCall,
	kinds: RemoteKinds,
	member: string,
	base: ProviderDescription,
) {
	const cache = new Map<string, ProviderDescription>();
	kinds.set(member, { cache, fields: [...(base.fields || [])] });
	const described = (acceptance: Acceptance) => cache.get(keyOf(acceptance));
	registerAcceptanceVerifier(member, {
		fields: base.fields,
		evidenceKind: base.evidenceKind,
		...(base.operationVerifier ? { operationVerifier: base.operationVerifier } : {}),
		label: (acceptance: Acceptance) => described(acceptance)?.label || member,
		consent: (acceptance: Acceptance) => described(acceptance)?.consent || null,
		pending: (milestone: AcceptanceMilestone) => described(effectiveAcceptance(milestone))?.pending || null,
		verify: async (acceptance: Acceptance) => {
			try {
				return await call("provider.read", address(member, "verify", acceptance));
			} catch (error) {
				return {
					state: "unknown",
					reason: "verifier-unavailable",
					summary: String((error as { message?: unknown } | null)?.message || error).slice(0, 200),
				};
			}
		},
	});
}

async function prepareAcceptances(
	call: ProviderCall,
	kinds: RemoteKinds,
	tasks: readonly RemainingTask[],
	signal?: AbortSignal,
) {
	for (const task of tasks)
		for (const milestone of task.milestones || []) {
			const kind = milestone.acceptance?.kind as string,
				entry = kinds.get(kind);
			if (!entry) continue;
			for (const acceptance of [milestone.acceptance, effectiveAcceptance(milestone)]) {
				const key = keyOf(acceptance);
				if (entry.cache.has(key)) continue;
				try {
					const described = await call("provider.read", address(kind, "describe", acceptance), signal);
					entry.cache.set(key, described as ProviderDescription);
				} catch {
					continue;
				}
				if (entry.cache.size > CACHE_LIMIT) entry.cache.delete(entry.cache.keys().next().value as string);
			}
		}
}

async function identifyAcceptances(
	call: ProviderCall,
	kinds: RemoteKinds,
	milestones: readonly WorkbenchMilestone[],
	signal?: AbortSignal,
) {
	const used = new Set(
		milestones.map((milestone) => milestone.acceptance?.kind as string).filter((kind) => kinds.has(kind)),
	);
	const found = [];
	for (const kind of used) {
		let identity: unknown = null;
		try {
			identity = await call("provider.native", address(kind, "identify", null), signal);
		} catch {
			continue;
		}
		if (identity && typeof identity === "object") found.push({ kind, identity });
	}
	return found;
}

/**
 * Acceptance checkers that other managed plugins provide (Drone Desktop managed runtime). The task
 * plugin consumes the role `acceptance` (manifest `drone.consumes.acceptance`, prefix
 * `task.acceptance:`); each checker runs in its provider's owner and this side never sees its code.
 *
 * `label`, `consent` and `pending` are synchronous in the workbench, so their text is fetched ahead
 * (`prepare`) and cached. A cache miss shows the kind name and grants nothing. A provider that is gone
 * verifies as `unknown`, which blocks its milestone. Identity comes from the provider reading the
 * actual tool event the host hands it (`provider.native`), never from JSON passed on here.
 */
export function createRemoteAcceptance(call: ProviderCall) {
	const kinds: RemoteKinds = new Map();
	return {
		/** Kinds and their fields, for the task context the model reads. */
		kinds: () => [...kinds].map(([kind, { fields }]) => ({ kind, fields })),
		/** Registers every available provider once. Needs a live hook: provider.read is not a bootstrap call. */
		async load(signal?: AbortSignal) {
			let listed: PluginProviderEnumeration;
			try {
				listed = (await call("provider.enumerate", { role: ROLE }, signal)) as PluginProviderEnumeration;
			} catch (error) {
				// A package that declares no acceptance role simply has no remote checkers.
				if (/Undeclared provider role/.test((error as { message?: string } | null)?.message as string))
					return;
				throw error;
			}
			for (const { member, state } of listed.members)
				if (state === "available" && !kinds.has(member)) {
					const base = await call("provider.read", address(member, "describe", null), signal);
					registerRemoteVerifier(call, kinds, member, base as ProviderDescription);
				}
		},
		/** The provider's text for one acceptance, fetched now (a rebind names an acceptance not planned). */
		async describeNow(acceptance: Acceptance | null | undefined, signal?: AbortSignal) {
			const kind = acceptance?.kind as string;
			if (!kinds.has(kind)) return null;
			return call("provider.read", address(kind, "describe", acceptance), signal);
		},
		/** Write allowances for the host's task authorization: one per milestone whose provider names a consent entry. */
		allowances(milestones: readonly WorkbenchMilestone[]) {
			return milestones.flatMap((milestone) => {
				const kind = milestone.acceptance?.kind as string;
				const described = kinds.get(kind)?.cache.get(keyOf(effectiveAcceptance(milestone)));
				return described?.consent
					? [
							{
								id: milestone.id,
								role: ROLE,
								member: kind,
								label: String(described.label || kind).slice(0, 300),
								consent: described.consent,
							},
						]
					: [];
			});
		},
		/** Fetches the provider's text for milestones not seen yet. */
		prepare: (tasks: readonly RemainingTask[], signal?: AbortSignal) =>
			prepareAcceptances(call, kinds, tasks, signal),
		/** Inside tool_execution_end: each provider the task uses decides whether the actual event names an identity. */
		identify: (milestones: readonly WorkbenchMilestone[], signal?: AbortSignal) =>
			identifyAcceptances(call, kinds, milestones, signal),
	};
}
