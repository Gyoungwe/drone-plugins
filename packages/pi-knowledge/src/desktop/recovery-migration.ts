import { resolve } from "node:path";
import type { PluginRuntimeCapabilities, PluginRuntimeScope, PluginSessionRecordReadResult, PluginSessionRecordAdoptionInspection, PluginSessionRecordAdoptionCommitResult } from "@gyoungwe/plugin-api/runtime";
import { parseKnowledgeRecoveryCheckpoint } from "../core/recovery-checkpoint.js";
import type { KnowledgeReadOwner } from "./read-model.js";

const type = "drone-knowledge-recovery-v1";
/** Temporary 0.2.0/0.2.1 -> 0.3 migration. Remove this command and declaration before 0.4.0. */
export function createKnowledgeRecoveryMigration(capabilities: PluginRuntimeCapabilities, config: KnowledgeReadOwner["config"]) {
	return async (context: { cwd: string; signal?: AbortSignal; sessionManager: { getSessionId(): string } }) => {
		const call = (name: string, input: unknown) => capabilities.call(name, input, context.signal);
		const facts = await call("session.inspect", null) as { agentActive: boolean };
		if (facts.agentActive) throw new Error("Checkpoint migration requires an idle session");
		const scope = await call("caller.scope", null) as PluginRuntimeScope;
		const sessionId = context.sessionManager.getSessionId();
		if (scope.kind !== "session" || scope.sessionId !== sessionId || resolve(scope.workspaceDirectory) !== resolve(context.cwd))
			throw new Error("Checkpoint migration requires its actual originating session and workspace");
		const own = await call("session.records.read", null) as PluginSessionRecordReadResult;
		if (own.state !== "durable") throw new Error("Checkpoint migration requires durable session storage");
		const existing = own.records.find(record => record.type === type);
		if (existing) { parseKnowledgeRecoveryCheckpoint(existing.data); return { state: "already-present", creator: "unknown", packageVersion: "unknown", currentReadProof: false }; }
		const inspection = await call("session.records.adoption.inspect", { type }) as PluginSessionRecordAdoptionInspection;
		if (inspection.state !== "candidate") {
			if (inspection.state === "deferred") throw new Error("Checkpoint migration is deferred; no import was committed");
			return { state: inspection.state, creator: inspection.creator, packageVersion: inspection.packageVersion, currentReadProof: false };
		}
		if (!inspection.candidate) throw new Error("Checkpoint adoption did not return its declared candidate");
		const data = parseKnowledgeRecoveryCheckpoint(inspection.candidate.data);
		const binding = await config.readKnowledgeBinding({ fresh: true });
		if (!binding) throw new Error("Checkpoint migration requires the currently bound Vault");
		if (data.scope !== `${sessionId}:${resolve(context.cwd)}` || data.records.some(record => record.sessionId !== sessionId || record.vaultId !== binding.vaultId || record.bindingRevision !== binding.revision))
			throw new Error("Legacy checkpoint does not match the actual session, workspace and current Vault binding");
		const imported = { scope: data.scope, records: data.records.map(record => ({ ...record, evicted: false })) };
		const committed = await call("session.records.adoption.commit", { type, legacyId: inspection.candidate.id, legacyHash: inspection.candidate.hash, data: imported }) as PluginSessionRecordAdoptionCommitResult;
		if (committed.state !== "adopted" || committed.durability !== "durable") throw new Error("No durable knowledge checkpoint adoption was confirmed");
		const after = await call("session.records.read", null) as PluginSessionRecordReadResult;
		const saved = after.records.find(record => record.type === type && record.id === committed.id);
		if (after.state !== "durable" || !saved || JSON.stringify(saved.data) !== JSON.stringify(imported)) throw new Error("Adopted checkpoint could not be read back durably");
		const current = await config.readKnowledgeBinding({ fresh: true });
		if (!current || current.vaultId !== binding.vaultId || current.revision !== binding.revision) throw new Error("Vault binding changed during checkpoint migration; no current recovery proof was restored");
		return { state: "adopted", records: imported.records.length, creator: inspection.creator, packageVersion: inspection.packageVersion, currentReadProof: false };
	};
}
