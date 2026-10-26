import type { EvidenceHostLoader, EvidenceHostPort } from "@gyoungwe/plugin-api";
import { validateArtifactManifest } from "./artifacts.js";
import { verifyReplay } from "./replay.js";

function inputRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Evidence host input must be an object");
	return value as Record<string, unknown>;
}

/** Read-only host adapter for manifest validation and replay verification. */
export function createEvidenceHost(): EvidenceHostPort {
	return {
		contractVersion: 1,
		manifest: {
			tools: ["evidence_validate_manifest", "evidence_verify_replay"],
		},
		tools: {
			evidence_validate_manifest: {
				execute(input: unknown) {
					const value = inputRecord(input);
					return validateArtifactManifest(value.manifest as never, { requireIdentity: true });
				},
			},
			evidence_verify_replay: {
				execute(input: unknown) {
					const value = inputRecord(input);
					return verifyReplay(value.checkpoint as never, {
						environmentFingerprint:
							value.environmentFingerprint === undefined ? undefined : String(value.environmentFingerprint),
						outputs: value.outputs as never,
					});
				},
			},
		},
	};
}

export const evidenceHostLoader: EvidenceHostLoader = {
	contractVersion: 1,
	load: createEvidenceHost,
};

