import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudProbeResult, CloudStatusResult } from "../src/desktop/cloud-contract";
import { CloudOperationFailure, cloudResult, NativeKnowledgeCloudSync } from "./NativeKnowledgeCloudSync";
import { cloudReason, useNativeKnowledgeCloudText } from "./native-cloud-copy";
import { Button } from "./runtime-api";

export type CloudRequest = (work: (current: () => boolean) => Promise<void>) => Promise<void>;

function useCloudRequests() {
	const [pending, setPending] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const epoch = useRef(0);
	const run: CloudRequest = useCallback(async (work) => {
		const request = ++epoch.current;
		const current = () => request === epoch.current;
		setPending((count) => count + 1);
		setError(null);
		try {
			await work(current);
		} catch (cause) {
			// Runtime rejections may contain sensitive details; retain only localized codes.
			if (current()) setError(cause instanceof CloudOperationFailure ? cause.reason : "");
			console.warn("Knowledge cloud request failed");
		} finally {
			setPending((count) => count - 1);
		}
	}, []);
	return { busy: pending > 0, error, epoch, run };
}

function CloudDisclosure({ status }: { status: CloudStatusResult }) {
	const t = useNativeKnowledgeCloudText();
	return (
		<>
			<p role="status">{t[status.status]}</p>
			{status.reason && <p>{cloudReason(t, status.reason)}</p>}
			{status.credentialSource && <p data-testid="cloud-source">{t[status.credentialSource]}</p>}
			{status.credentialSource === "env" && status.savedConfigured === true && <p>{t.savedUnused}</p>}
		</>
	);
}

function CloudEndpointDisclosure({ endpoint }: Pick<CloudStatusResult, "endpoint">) {
	const t = useNativeKnowledgeCloudText();
	if (endpoint?.state !== "ready") return null;
	return (
		<div>
			<p>{t.effectiveEndpoint}</p>
			<p style={{ userSelect: "text", overflowWrap: "anywhere" }}>{endpoint.url}</p>
			<p>{endpoint.source === "env" ? t.endpointEnv : t.endpointDefault}</p>
			{endpoint.url.startsWith("http:") && <p className="text-warn">{t.httpWarning}</p>}
		</div>
	);
}

interface CloudProps {
	client: PluginUiRuntimeClient;
	observationRevision: number;
	refreshing: boolean;
	bindingRevision: number | null;
}

function useCloudConnection({ client, observationRevision, bindingRevision }: CloudProps) {
	const [status, setStatus] = useState<CloudStatusResult | null>(null);
	const [initialized, setInitialized] = useState<boolean | null>(null);
	const requests = useCloudRequests();
	const { run, epoch } = requests;
	const refresh = useCallback(
		() =>
			run(async (current) => {
				setStatus(null);
				setInitialized(null);
				const result = (await client.invoke("cloudStatus", null)) as CloudStatusResult;
				if (current()) setStatus(result);
			}),
		[client, run],
	);
	useEffect(() => {
		void refresh();
		return () => {
			++epoch.current;
		};
	}, [refresh, epoch, observationRevision, bindingRevision]);
	const check = (operation: "cloudProbe" | "cloudInitialize") =>
		run(async (current) => {
			setInitialized(null);
			const response = (await client.invoke(operation, null)) as CloudProbeResult;
			const result = cloudResult(response);
			if (current()) setInitialized(result.initialized);
		});
	return { ...requests, status, initialized, refresh, check };
}

export function NativeKnowledgeCloud(props: CloudProps) {
	const { refreshing, bindingRevision } = props;
	const t = useNativeKnowledgeCloudText();
	const requests = useCloudConnection(props);
	const { status, initialized } = requests;
	const disabled = requests.busy || refreshing;
	return (
		<section
			className="space-y-3 rounded-xl border border-border bg-surface p-4 text-xs"
			aria-label={t.title}
		>
			<h3 className="text-sm font-medium">{t.title}</h3>
			{status && <CloudEndpointDisclosure endpoint={status.endpoint} />}
			<p>{t.hint}</p>
			{status && <CloudDisclosure status={status} />}
			{requests.busy && <p role="status">{t.loading}</p>}
			{requests.error !== null && <p role="alert">{cloudReason(t, requests.error)}</p>}
			<Button
				size="sm"
				disabled={disabled || status?.reason === "host_unsupported"}
				onClick={() => void requests.refresh()}
			>
				{t.refresh}
			</Button>
			<Button
				size="sm"
				disabled={disabled || status?.status !== "available"}
				onClick={() => void requests.check("cloudProbe")}
			>
				{t.probe}
			</Button>
			{initialized !== null && <p>{initialized ? t.initialized : t.uninitialized}</p>}
			{initialized === false && (
				<Button
					size="sm"
					disabled={disabled || status?.status !== "available"}
					onClick={() => void requests.check("cloudInitialize")}
				>
					{t.initialize}
				</Button>
			)}
			{bindingRevision === null && <p>{t.needsBinding}</p>}
			{status?.status === "available" && initialized === true && bindingRevision !== null && (
				<NativeKnowledgeCloudSync
					key={`${props.observationRevision}:${bindingRevision}`}
					client={props.client}
					bindingRevision={bindingRevision}
					disabled={disabled}
					run={requests.run}
				/>
			)}
		</section>
	);
}
