import type {
	PluginBinaryStateReadResult,
	PluginRuntimeCapabilities,
	PluginRuntimeRootDescription,
	PluginRuntimeScope,
	PluginStateReadResult,
} from "@gyoungwe/plugin-api/runtime";
import {
	type InquiryBindingState,
	InquiryLedgerOwner,
	type InquiryWasmEngine,
	inquiryBindingPath,
	parseInquiryBinding,
} from "./ledger-owner.js";

export interface RuntimeOwner {
	owner: InquiryLedgerOwner;
	root: string;
	metadataRoot: string;
}

function createBindingReaders(capabilities: PluginRuntimeCapabilities, engine: InquiryWasmEngine) {
	const lookup = async (
		scope: Exclude<PluginRuntimeScope, { kind: "application" }>,
		available: readonly PluginRuntimeRootDescription[],
	): Promise<InquiryBindingState | null> => {
		const found: InquiryBindingState[] = [];
		const path = inquiryBindingPath();
		for (const root of available.filter((root) => root.kind === "state")) {
			const result = (await capabilities.call("state.readJson", {
				root: root.handle,
				path,
			})) as PluginStateReadResult;
			const value = parseInquiryBinding(result, scope.workspaceId);
			if (value && result.kind === "value")
				found.push({ root: root.handle, path, value, version: result.version });
		}
		if (found.length > 1)
			throw new Error("Multiple approved Inquiry bindings match this workspace; no first-root adoption");
		return found[0] ?? null;
	};
	const inspect = async (root: PluginRuntimeRootDescription) => {
		for (const path of ["ledger.sqlite-wal", "ledger.sqlite-shm", "ledger.sqlite-journal"])
			if (
				(
					(await capabilities.call("state.readBinary", {
						root: root.handle,
						path,
					})) as PluginBinaryStateReadResult
				).kind !== "missing"
			)
				throw new Error(`Inquiry SQLite sidecar must be closed before import: ${path}`);
		const raw = (await capabilities.call("state.readBinary", {
			root: root.handle,
			path: "ledger.sqlite",
		})) as PluginBinaryStateReadResult;
		return {
			raw,
			metadata:
				raw.kind === "value" ? engine.inspect(new Uint8Array(Buffer.from(raw.base64, "base64"))) : null,
		};
	};
	return { lookup, inspect };
}

export function createRuntimeOwners({
	capabilities,
	owners,
	engine,
}: {
	capabilities: PluginRuntimeCapabilities;
	owners: Map<string, RuntimeOwner>;
	engine: InquiryWasmEngine;
}) {
	const { lookup, inspect } = createBindingReaders(capabilities, engine);
	const owned = async (
		scope: Exclude<PluginRuntimeScope, { kind: "application" }>,
		available: readonly PluginRuntimeRootDescription[],
		reconcileMetadata = false,
	) => {
		const binding = await lookup(scope, available);
		if (!binding) throw new Error("Inquiry workspace needs an explicit root binding");
		const root = available.find(
			(root) => root.kind === "binary-state" && root.path === binding.value.binaryPath,
		);
		if (!root) throw new Error("Reselect the original bound Inquiry directory; saved paths grant no access");
		let current = owners.get(scope.workspaceId);
		if (current && (current.root !== root.handle || current.metadataRoot !== binding.root))
			throw new Error("Inquiry workspace already has another active root owner");
		if (current && current.owner.bindingVersion !== binding.version) {
			if (!reconcileMetadata)
				throw new Error("Inquiry metadata changed; explicit reconciliation is required");
			await current.owner.dispose();
			owners.delete(scope.workspaceId);
			current = undefined;
		}
		if (!current) {
			current = {
				owner: new InquiryLedgerOwner(engine, capabilities, binding, root),
				root: root.handle,
				metadataRoot: binding.root,
			};
			owners.set(scope.workspaceId, current);
		}
		return current.owner;
	};
	/** The ledger owner of an already-bound scope, or nothing when Inquiry is unbound there. */
	const optionalOwner = async (
		scope: Exclude<PluginRuntimeScope, { kind: "application" }>,
		available: readonly PluginRuntimeRootDescription[],
	) => {
		if (!(await lookup(scope, available))) return undefined;
		return owned(scope, available);
	};
	return { lookup, inspect, owned, optionalOwner };
}
