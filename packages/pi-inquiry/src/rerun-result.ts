import type { ArtifactRerunRecord, ArtifactRerunResult } from "./models.js";

export function rerunResult(rerun: ArtifactRerunRecord): ArtifactRerunResult {
	return {
		status: rerun.status,
		jobId: rerun.jobId,
		previousArtifactId: rerun.sourceArtifactId,
		previousSha256: rerun.previousSha256,
		...(rerun.resultArtifactId ? { artifactId: rerun.resultArtifactId } : {}),
		...(rerun.sha256 ? { sha256: rerun.sha256 } : {}),
		...(rerun.difference ? { difference: rerun.difference } : {}),
		...(rerun.error ? { error: rerun.error } : {}),
	};
}
