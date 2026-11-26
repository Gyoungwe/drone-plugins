import type { ArtifactManifestValidation } from "./artifacts.js";
import { isSha256, sha256Hex } from "./digest.js";
import type { ReplayVerification } from "./replay.js";

const diagnostics = {
	verifyReplay: {
		failureCode: "replay-verification-failed",
		subject: "Replay verification",
		summary: "The replay outputs or environment did not match the checkpoint.",
	},
	validateArtifactManifest: {
		failureCode: "artifact-manifest-invalid",
		subject: "Artifact manifest validation",
		summary: "The artifact manifest failed validation.",
	},
	validateCapsuleImport: {
		failureCode: "capsule-import-invalid",
		subject: "Capsule import validation",
		summary: "The evidence capsule failed import validation.",
	},
} as const;

type Validator = keyof typeof diagnostics;
export type EvidenceFailureDiagnostic =
	| { validator: "verifyReplay"; result: Pick<ReplayVerification, "status"> }
	| { validator: "validateArtifactManifest"; result: Pick<ArtifactManifestValidation, "valid"> }
	| { validator: Validator; error: unknown };

export interface FailureCandidateInput {
	failureCode: (typeof diagnostics)[Validator]["failureCode"];
	subject: string;
	scopeKind: "project";
	summary: string;
	provenance: {
		sourcePlugin: "drone-pi-evidence";
		producer: "evidence-validator";
		receiptId: string;
	};
}

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function evidenceFailureCandidate(
	diagnostic: EvidenceFailureDiagnostic,
	receiptId: string,
): FailureCandidateInput | undefined {
	if ("result" in diagnostic) {
		const succeeded =
			diagnostic.validator === "verifyReplay"
				? diagnostic.result.status === "reproduced"
				: diagnostic.result.valid;
		if (succeeded) return;
	}
	return {
		...diagnostics[diagnostic.validator],
		scopeKind: "project",
		provenance: {
			sourcePlugin: "drone-pi-evidence",
			producer: "evidence-validator",
			receiptId: uuid.test(receiptId) || isSha256(receiptId) ? receiptId : sha256Hex(receiptId),
		},
	};
}
