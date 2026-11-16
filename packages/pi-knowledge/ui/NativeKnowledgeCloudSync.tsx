import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import { useState } from "react";
import type {
	CloudOperationResult,
	CloudReadResult,
	CloudSyncOperationResult,
} from "../src/desktop/cloud-contract";
import type { CloudSyncInput, CloudSyncPreview, CloudSyncResult } from "../src/desktop/cloud-sync";
import type { KnowledgeReadNoteResult } from "../src/desktop/contract";
import type { CloudRequest } from "./NativeKnowledgeCloud";
import { cloudReason, useNativeKnowledgeCloudText } from "./native-cloud-copy";
import { Button } from "./runtime-api";

interface SyncProps {
	client: PluginUiRuntimeClient;
	bindingRevision: number;
	disabled: boolean;
	run: CloudRequest;
}

export class CloudOperationFailure extends Error {
	constructor(readonly reason: string) {
		super("Cloud operation failed");
	}
}

export function cloudResult<T>(response: CloudOperationResult<T>): T {
	if (response.status === "failed") throw new CloudOperationFailure(response.reason);
	return response.result;
}

async function readPreview(
	client: PluginUiRuntimeClient,
	path: string,
	revision: number,
): Promise<CloudSyncPreview> {
	const local = (await client.invoke("readNote", {
		path,
		revision,
		startLine: 1,
	})) as KnowledgeReadNoteResult;
	const response = (await client.invoke("cloudRead", { path })) as CloudReadResult;
	const remote =
		response.status === "failed" && response.reason === "not_found" ? null : cloudResult(response);
	return {
		path,
		localHash: local.missing ? null : local.hash,
		remoteHash: remote === null ? null : remote.hash,
		remoteVersion: remote === null ? null : remote.version,
	};
}

function useSelectedNote({ client, bindingRevision, run }: SyncProps) {
	const [path, setPath] = useState("");
	const [preview, setPreview] = useState<CloudSyncPreview | null>(null);
	const [result, setResult] = useState<CloudSyncResult | null>(null);
	const changePath = (value: string) => {
		setPath(value);
		setPreview(null);
		setResult(null);
	};
	const inspect = () => {
		setPreview(null);
		setResult(null);
		return run(async (current) => {
			const snapshot = await readPreview(client, path, bindingRevision);
			if (current()) setPreview(snapshot);
		});
	};
	const sync = (mode: CloudSyncInput["mode"], resolution?: CloudSyncInput["resolution"]) => {
		const observed = preview;
		setPreview(null);
		setResult(null);
		return run(async (current) => {
			const snapshot = resolution ? await readPreview(client, path, bindingRevision) : observed;
			// An observation/caller change while resolving must never launch a stale write.
			if (!current() || !snapshot) return;
			if (resolution) setPreview(snapshot);
			const input: CloudSyncInput = {
				mode,
				bindingRevision,
				paths: [path],
				previews: [snapshot],
				...(resolution ? { resolution } : {}),
			};
			const response = (await client.invoke("cloudSync", input)) as CloudSyncOperationResult;
			const synced = cloudResult(response);
			if (current()) {
				setPreview(null);
				setResult(synced);
			}
		});
	};
	return { path, preview, result, changePath, inspect, sync };
}

function CloudPreview({ preview }: { preview: CloudSyncPreview }) {
	const t = useNativeKnowledgeCloudText();
	return (
		<div className="space-y-2">
			<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
				<dt>{t.localHash}</dt>
				<dd className="font-mono">
					{preview.localHash === null ? t.missing : preview.localHash.slice(0, 12)}
				</dd>
				<dt>{t.remoteHash}</dt>
				<dd className="font-mono">
					{preview.remoteHash === null ? t.missing : preview.remoteHash.slice(0, 12)}
				</dd>
				<dt>{t.remoteVersion}</dt>
				<dd className="break-all font-mono">
					{preview.remoteVersion === null ? t.noVersion : preview.remoteVersion}
				</dd>
			</dl>
			<p>{preview.localHash === preview.remoteHash ? t.same : t.different}</p>
		</div>
	);
}

function CloudSyncResults({ result }: { result: CloudSyncResult }) {
	const t = useNativeKnowledgeCloudText();
	return (
		<div className="space-y-2" role="status">
			{result.items.map((item) => (
				<div key={item.path}>
					<p className="break-all">{item.path}</p>
					<p>{t.items[item.status]}</p>
					{item.reason && <p>{cloudReason(t, item.reason)}</p>}
				</div>
			))}
			{result.warnings.includes("selected_notes_only") && <p>{t.selectedNotesOnly}</p>}
		</div>
	);
}

export function NativeKnowledgeCloudSync(props: SyncProps) {
	const t = useNativeKnowledgeCloudText();
	const note = useSelectedNote(props);
	const conflict = note.result?.items.some((item) => item.status === "conflict");
	return (
		<section className="space-y-3 rounded-lg border border-border p-3" aria-label={t.syncTitle}>
			<h4 className="font-medium">{t.syncTitle}</h4>
			<label className="block">
				<span>{t.path}</span>
				<input
					type="text"
					value={note.path}
					disabled={props.disabled}
					placeholder="Wiki/topic.md"
					className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono"
					onChange={(event) => note.changePath(event.target.value)}
				/>
			</label>
			<Button size="sm" disabled={props.disabled || !note.path.trim()} onClick={() => void note.inspect()}>
				{t.preview}
			</Button>
			{note.preview && <CloudPreview preview={note.preview} />}
			<div className="flex flex-wrap gap-2">
				<Button size="sm" disabled={props.disabled || !note.preview} onClick={() => void note.sync("pull")}>
					{t.pull}
				</Button>
				<Button size="sm" disabled={props.disabled || !note.preview} onClick={() => void note.sync("push")}>
					{t.push}
				</Button>
				{conflict && (
					<>
						<Button size="sm" disabled={props.disabled} onClick={() => void note.sync("push", "local")}>
							{t.keepLocal}
						</Button>
						<Button size="sm" disabled={props.disabled} onClick={() => void note.sync("pull", "remote")}>
							{t.keepCloud}
						</Button>
					</>
				)}
			</div>
			{note.result && <CloudSyncResults result={note.result} />}
		</section>
	);
}
