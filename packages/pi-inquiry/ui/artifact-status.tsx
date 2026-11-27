import type {
	ArtifactContributionProps,
	DroneUiRuntime,
	PluginUiRuntimeClient,
} from "@gyoungwe/plugin-api/ui";
import { useEffect, useState } from "react";
import { copy } from "./copy.js";
import type { Status } from "./index.js";

type ArtifactStatus = Pick<Status, "state" | "unavailable">;
const host = (window as typeof window & { DroneUI: DroneUiRuntime }).DroneUI;
const stateCopy = {
	"select-workspace": "select",
	"needs-binding": "statusNeedsBinding",
	"needs-recovery": "statusNeedsRecovery",
	bound: "statusBound",
} as const;

export function unavailableNotices(unavailable: readonly string[] | undefined, text: typeof copy.en) {
	const notices: string[] = [];
	if (unavailable?.includes("rerun-executor")) notices.push(text.rerunUnavailable);
	if (unavailable?.includes("workspace-promotion-file-port")) notices.push(text.promotionUnavailable);
	return notices;
}

function useAvailableRuntime() {
	try {
		return host.hooks.usePluginRuntime();
	} catch {
		return null;
	}
}

async function readStatus(
	runtime: PluginUiRuntimeClient,
	{ surface, artifactId }: ArtifactContributionProps,
	signal: AbortSignal,
) {
	if (surface === "artifacts.card") {
		if (artifactId === null) return null;
		const { value } = (await runtime.invoke(
			"inquiry.read",
			{ action: "artifactProvenance", id: artifactId },
			signal,
		)) as {
			value: unknown;
		};
		if (signal.aborted || value === null) return null;
	}
	return (await runtime.invoke("inquiry.read", { action: "status" }, signal)) as ArtifactStatus;
}

function StatusLine({ context }: { context: ArtifactContributionProps }) {
	const text = copy[host.hooks.useLanguage()];
	const runtime = useAvailableRuntime();
	const [status, setStatus] = useState<ArtifactStatus | "error" | null>(null);
	useEffect(() => {
		if (!runtime) return;
		const controller = new AbortController();
		void readStatus(runtime, context, controller.signal).then(
			(result) => {
				if (!controller.signal.aborted) setStatus(result);
			},
			() => {
				if (!controller.signal.aborted) setStatus("error");
			},
		);
		return () => controller.abort();
	}, [context, runtime]);
	if (!runtime || status === "error") return <p className="text-xs text-muted">{text.statusUnavailable}</p>;
	if (!status) return null;
	return (
		<p role="status" className="text-xs text-muted">
			{[
				text[stateCopy[status.state]],
				...unavailableNotices(status.unavailable, text),
				text.statusSeePanel,
			].join(" ")}
		</p>
	);
}

export function InquiryArtifactStatus(props: ArtifactContributionProps) {
	const { surface, artifactId, analysisId, capabilityId, sessionId, workspaceId } = props;
	if (surface === "artifacts.card" && artifactId === null) return null;
	const key = JSON.stringify([surface, artifactId, analysisId, capabilityId, sessionId, workspaceId]);
	return <StatusLine key={key} context={props} />;
}
