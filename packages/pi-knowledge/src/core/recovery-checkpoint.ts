import { posix } from "node:path";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";

const text = Type.String({ minLength: 1, maxLength: 512 });
const record = Type.Object({
	id: text, sessionId: text, taskId: Type.Union([text, Type.Null()]),
	path: text, hash: Type.String({ pattern: "^[a-f0-9]{64}$" }),
	startLine: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
	maxChars: Type.Integer({ minimum: 200, maximum: 8000 }),
	vaultId: Type.String({ pattern: "^[a-f0-9]{24}$" }),
	bindingRevision: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
	evicted: Type.Boolean(), used: Type.Boolean(),
});
const checkpoint = Type.Object({ scope: Type.String({ minLength: 1 }), records: Type.Array(record, { maxItems: 8 }) });
export type KnowledgeRecoveryCheckpoint = Static<typeof checkpoint>;

/** Persisted JSON is data, never a source of a current read ticket, grant or live proof. */
export function parseKnowledgeRecoveryCheckpoint(value: unknown): KnowledgeRecoveryCheckpoint {
	if (!Check(checkpoint, value)) throw new Error("Invalid knowledge recovery checkpoint");
	const records = value.records.map(item => {
		const path = posix.normalize(item.path.replaceAll("\\", "/"));
		if (path === "." || path.startsWith("/") || /^[a-z]:/i.test(path) || path === ".." || path.startsWith("../") || path.includes("\0"))
			throw new Error("Knowledge recovery path must remain within the Vault");
		// Copy only the known historical read-window data. Unknown JSON grant/proof
		// fields are intentionally discarded rather than reused by a new owner.
		return { id: item.id, sessionId: item.sessionId, taskId: item.taskId, path,
			hash: item.hash, startLine: item.startLine, maxChars: item.maxChars,
			vaultId: item.vaultId, bindingRevision: item.bindingRevision,
			evicted: item.evicted, used: item.used };
	});
	if (new Set(records.map(record => record.id)).size !== records.length) throw new Error("Knowledge recovery checkpoint has duplicate receipt identities");
	return { scope: value.scope, records };
}
