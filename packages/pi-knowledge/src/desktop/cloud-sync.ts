import {
	CloudError,
	type CloudErrorCode,
	type CloudNote,
	type CloudService,
	type CloudVault,
} from "./cloud.js";
import { cloudNotePath } from "./cloud-paths.js";

export interface CloudSyncPreview {
	path: string;
	localHash: string | null;
	remoteHash: string | null;
	remoteVersion: string | null;
}

export interface CloudSyncInput {
	mode: "pull" | "push";
	bindingRevision: number;
	paths: string[];
	previews?: CloudSyncPreview[];
	resolution?: "local" | "remote";
}

export interface CloudSyncItem {
	path: string;
	status: "unchanged" | "pulled" | "pushed" | "conflict" | "skipped" | "failed";
	localHash: string | null;
	remoteVersion: string | null;
	reason:
		| CloudErrorCode
		| "divergent"
		| "source_missing"
		| "index_pending"
		| "missing_strong_etag"
		| "write_unverified"
		| null;
}

export interface CloudSyncResult {
	mode: "pull" | "push";
	completed: boolean;
	items: CloudSyncItem[];
	warnings: "selected_notes_only"[];
}

type LocalNote = Awaited<ReturnType<CloudVault["readNote"]>>;
type Outcome = Pick<CloudSyncItem, "status" | "localHash" | "remoteVersion" | "reason">;
interface SyncContext {
	cloud: Pick<CloudService, "read" | "write">;
	vault: CloudVault;
	binding: NonNullable<Awaited<ReturnType<CloudVault["readBinding"]>>>;
	mode: CloudSyncInput["mode"];
	resolution: CloudSyncInput["resolution"];
}

function selectedPreviews(input: CloudSyncInput): CloudSyncPreview[] {
	if (
		!Array.isArray(input.paths) ||
		!input.paths.length ||
		input.paths.length > 64 ||
		!["pull", "push"].includes(input.mode)
	)
		throw new CloudError("protocol");
	const paths = [...new Set(input.paths.map(cloudNotePath))];
	if (!Array.isArray(input.previews) || input.previews.length !== paths.length)
		throw new CloudError("conflict");
	const previews = new Map<string, CloudSyncPreview>();
	for (const preview of input.previews) {
		const path = cloudNotePath(preview.path);
		if (!paths.includes(path) || previews.has(path)) throw new CloudError("protocol");
		previews.set(path, { ...preview, path });
	}
	return paths.map((path) => {
		const preview = previews.get(path);
		if (!preview) throw new CloudError("protocol");
		return preview;
	});
}

async function checkBinding(context: SyncContext): Promise<void> {
	const current = await context.vault.readBinding({ fresh: true });
	if (current?.vaultId !== context.binding.vaultId || current?.revision !== context.binding.revision)
		throw new CloudError("conflict");
}

async function readLocal(vault: CloudVault, root: string, path: string): Promise<LocalNote | null> {
	try {
		return await vault.readNote(root, path);
	} catch (error) {
		// Missing source notes skip or create; every other Vault failure remains a failed item.
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
			return null;
		throw error;
	}
}

async function readRemote(cloud: SyncContext["cloud"], path: string): Promise<CloudNote | null> {
	try {
		return await cloud.read(path);
	} catch (error) {
		if (error instanceof CloudError && error.code === "not_found") return null;
		throw error;
	}
}

async function checkLocal(context: SyncContext, path: string, hash: string): Promise<void> {
	if ((await context.vault.readNote(context.binding.vault, path)).hash !== hash)
		throw new CloudError("conflict");
}

async function pushNote(
	context: SyncContext,
	path: string,
	local: LocalNote,
	remote: CloudNote | null,
): Promise<Outcome> {
	const expectedVersion = remote?.version;
	if (remote && !expectedVersion) throw new CloudError("conflict");
	await checkLocal(context, path, local.hash);
	await checkBinding(context);
	const result = await context.cloud.write({
		path,
		text: local.text,
		...(expectedVersion ? { expectedVersion } : {}),
	});
	let status: CloudSyncItem["status"] = "failed";
	if (result.status === (remote ? "updated" : "created")) status = "pushed";
	else if (result.status === "conflict") status = "conflict";
	return { status, localHash: local.hash, remoteVersion: result.version, reason: result.reason };
}

async function pullNote(
	context: SyncContext,
	preview: CloudSyncPreview,
	local: LocalNote | null,
	remote: CloudNote,
): Promise<Outcome> {
	if (!remote.version || !preview.remoteVersion) throw new CloudError("conflict");
	if (local) await checkLocal(context, preview.path, local.hash);
	const target = await context.vault.containedFile(context.binding.vault, preview.path);
	await checkBinding(context);
	if (local) {
		try {
			await context.vault.replaceFile(target, remote.text, { expectedHash: local.hash });
		} catch (error) {
			if (context.vault.isConflict(error)) throw new CloudError("conflict");
			throw error;
		}
	} else if (!(await context.vault.createFileOnly(target, remote.text))) {
		return { status: "conflict", localHash: null, remoteVersion: remote.version, reason: "conflict" };
	}
	// The Vault port owns atomic/CAS writes; domain success also requires matching readback.
	if ((await context.vault.readNote(context.binding.vault, preview.path)).hash !== remote.hash)
		throw new CloudError("protocol");
	return { status: "pulled", localHash: remote.hash, remoteVersion: remote.version, reason: "index_pending" };
}

async function transferNote(
	context: SyncContext,
	preview: CloudSyncPreview,
	local: LocalNote | null,
	remote: CloudNote | null,
): Promise<Outcome> {
	const versions = { localHash: local?.hash ?? null, remoteVersion: remote?.version ?? null };
	if (local && remote) {
		if (local.hash === remote.hash) return { ...versions, status: "unchanged", reason: null };
		if (context.mode === "push" && context.resolution === "local")
			return pushNote(context, preview.path, local, remote);
		if (context.mode === "pull" && context.resolution === "remote")
			return pullNote(context, preview, local, remote);
		return { ...versions, status: "conflict", reason: "divergent" };
	}
	if (context.mode === "push" && local) return pushNote(context, preview.path, local, null);
	if (context.mode === "pull" && remote) return pullNote(context, preview, null, remote);
	return { ...versions, status: "skipped", reason: "source_missing" };
}

async function syncNote(context: SyncContext, preview: CloudSyncPreview): Promise<CloudSyncItem> {
	let localHash: string | null = null;
	let remoteVersion: string | null = null;
	try {
		await checkBinding(context);
		const local = await readLocal(context.vault, context.binding.vault, preview.path);
		localHash = local?.hash ?? null;
		const remote = await readRemote(context.cloud, preview.path);
		remoteVersion = remote?.version ?? null;
		await checkBinding(context);
		if (
			localHash !== preview.localHash ||
			(remote?.hash ?? null) !== preview.remoteHash ||
			remoteVersion !== preview.remoteVersion
		)
			throw new CloudError("conflict");
		return { path: preview.path, ...(await transferNote(context, preview, local, remote)) };
	} catch (error) {
		return {
			path: preview.path,
			localHash,
			remoteVersion,
			status: error instanceof CloudError && error.code === "conflict" ? "conflict" : "failed",
			reason: error instanceof CloudError ? error.code : "protocol",
		};
	}
}

export async function syncCloudNotes(
	cloud: SyncContext["cloud"],
	input: CloudSyncInput,
	vault: CloudVault,
): Promise<CloudSyncResult> {
	const previews = selectedPreviews(input);
	const binding = await vault.readBinding({ fresh: true });
	if (!binding || binding.revision !== input.bindingRevision) throw new CloudError("conflict");
	const context = { cloud, vault, binding, mode: input.mode, resolution: input.resolution };
	const items: CloudSyncItem[] = [];
	for (const preview of previews) items.push(await syncNote(context, preview));
	return {
		mode: input.mode,
		completed: items.every((item) => ["unchanged", "pulled", "pushed"].includes(item.status)),
		items,
		warnings: ["selected_notes_only"],
	};
}
