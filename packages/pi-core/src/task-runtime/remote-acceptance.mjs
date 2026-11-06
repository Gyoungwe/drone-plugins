import { effectiveAcceptance, registerAcceptanceVerifier } from "./acceptance.mjs";

const ROLE = "acceptance";
const CACHE_LIMIT = 256;
const keyOf = (acceptance) =>
	JSON.stringify(
		Object.keys(acceptance || {})
			.sort()
			.map((key) => [key, acceptance[key]]),
	);

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
export function createRemoteAcceptance(call) {
	const kinds = new Map();
	const address = (member, operation, input) => ({ role: ROLE, member, operation, input });
	const register = (member, base) => {
		const cache = new Map();
		kinds.set(member, { cache, fields: [...(base.fields || [])] });
		const described = (acceptance) => cache.get(keyOf(acceptance));
		registerAcceptanceVerifier(member, {
			fields: base.fields,
			evidenceKind: base.evidenceKind,
			...(base.operationVerifier ? { operationVerifier: base.operationVerifier } : {}),
			label: (acceptance) => described(acceptance)?.label || member,
			consent: (acceptance) => described(acceptance)?.consent || null,
			pending: (milestone) => described(effectiveAcceptance(milestone))?.pending || null,
			verify: async (acceptance) => {
				try {
					return await call("provider.read", address(member, "verify", acceptance));
				} catch (error) {
					return {
						state: "unknown",
						reason: "verifier-unavailable",
						summary: String(error?.message || error).slice(0, 200),
					};
				}
			},
		});
	};
	return {
		/** Kinds and their fields, for the task context the model reads. */
		kinds: () => [...kinds].map(([kind, { fields }]) => ({ kind, fields })),
		/** Registers every available provider once. Needs a live hook: provider.read is not a bootstrap call. */
		async load(signal) {
			let listed;
			try {
				listed = await call("provider.enumerate", { role: ROLE }, signal);
			} catch (error) {
				// A package that declares no acceptance role simply has no remote checkers.
				if (/Undeclared provider role/.test(error?.message)) return;
				throw error;
			}
			for (const { member, state } of listed.members)
				if (state === "available" && !kinds.has(member))
					register(member, await call("provider.read", address(member, "describe", null), signal));
		},
		/** The provider's text for one acceptance, fetched now (a rebind names an acceptance not planned). */
		async describeNow(acceptance, signal) {
			const kind = acceptance?.kind;
			if (!kinds.has(kind)) return null;
			return call("provider.read", address(kind, "describe", acceptance), signal);
		},
		/** Write allowances for the host's task authorization: one per milestone whose provider names a consent entry. */
		allowances(milestones) {
			return milestones.flatMap((milestone) => {
				const kind = milestone.acceptance?.kind;
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
		async prepare(tasks, signal) {
			for (const task of tasks)
				for (const milestone of task.milestones || []) {
					const kind = milestone.acceptance?.kind,
						entry = kinds.get(kind);
					if (!entry) continue;
					for (const acceptance of [milestone.acceptance, effectiveAcceptance(milestone)]) {
						const key = keyOf(acceptance);
						if (entry.cache.has(key)) continue;
						try {
							entry.cache.set(
								key,
								await call("provider.read", address(kind, "describe", acceptance), signal),
							);
						} catch {
							continue;
						}
						if (entry.cache.size > CACHE_LIMIT) entry.cache.delete(entry.cache.keys().next().value);
					}
				}
		},
		/** Inside tool_execution_end: each provider the task uses decides whether the actual event names an identity. */
		async identify(milestones, signal) {
			const used = new Set(milestones.map((m) => m.acceptance?.kind).filter((kind) => kinds.has(kind)));
			const found = [];
			for (const kind of used) {
				let identity = null;
				try {
					identity = await call("provider.native", address(kind, "identify", null), signal);
				} catch {
					continue;
				}
				if (identity && typeof identity === "object") found.push({ kind, identity });
			}
			return found;
		},
	};
}
