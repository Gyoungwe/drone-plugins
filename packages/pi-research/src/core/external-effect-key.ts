import { createHash } from "node:crypto";

/** Stable key for an external side effect; raw arguments and credentials stay out of receipts. */
export function externalEffectKey(namespace: string, identity: unknown): string {
	if (!namespace.trim()) throw new Error("external effect namespace is required");
	const stable = JSON.stringify(identity, (_key, entry) =>
		entry && typeof entry === "object" && !Array.isArray(entry)
			? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
			: entry,
	);
	return `${namespace.trim()}:${createHash("sha256").update(stable).digest("hex")}`;
}
