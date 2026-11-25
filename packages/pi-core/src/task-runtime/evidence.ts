import { resolve } from "node:path";
import type { TaskFileDescriptor } from "./file-inspection.ts";
import { clean, type TaskEntry } from "./workbench-state.js";

type EvidenceFile = Pick<TaskFileDescriptor, "path"> &
	Partial<Pick<TaskFileDescriptor, "rootKind" | "absolutePath">> & { sha256: string };

interface EvidenceRecord extends EvidenceFile {
	id: string;
	offset: number;
	limit: number;
	binding: string | null;
	evicted: boolean;
}

export interface EvidenceState {
	version: 1;
	scope: string | null;
	taskId: string | null | undefined;
	records: EvidenceRecord[];
	used: number;
}

export interface EvidenceEvent {
	toolCallId: string;
	input?: { path?: unknown; offset?: number; start_line?: number; limit?: number } | null;
}

interface EvidenceFiles {
	inspect(
		cwd: string,
		path: string,
		expected?: Pick<EvidenceFile, "sha256" | "rootKind">,
	): EvidenceFile | Promise<EvidenceFile>;
	readText(path: string): string | Promise<string>;
}

export interface EvidencePorts {
	authorize(cwd: string, path: string): unknown;
	files: EvidenceFiles;
	persist?(state: EvidenceState): unknown;
}

async function captureEvidence(
	state: EvidenceState,
	event: EvidenceEvent,
	cwd: string,
	binding: string | null,
	files: EvidenceFiles,
	save: () => unknown,
) {
	if (
		!state.taskId ||
		typeof event.input?.path !== "string" ||
		state.records.some((record) => record.id === event.toolCallId)
	)
		return;
	let file: EvidenceFile;
	try {
		file = await files.inspect(cwd, event.input.path);
	} catch (error) {
		// A successful tool read without a stable file cannot produce a recovery
		// receipt. Preserve that tool result, and diagnose only this optional capture.
		console.warn(
			"Task evidence capture unavailable:",
			(error as NodeJS.ErrnoException).code || "file-unavailable",
		);
		return;
	}
	const offset = Math.max(1, Math.floor(event.input.offset || event.input.start_line || 1));
	const limit = Math.min(120, Math.max(1, Math.floor(event.input.limit || 120)));
	state.records.push({
		id: clean(event.toolCallId, 100),
		path: file.path,
		sha256: file.sha256,
		...(file.rootKind ? { rootKind: file.rootKind } : {}),
		...(file.absolutePath ? { absolutePath: file.absolutePath } : {}),
		offset,
		limit,
		binding,
		evicted: false,
	});
	state.records = state.records.slice(-8);
	save();
}

async function restoreEvidence(
	state: EvidenceState,
	input: { receiptId: string; path: string },
	cwd: string,
	bindingProvider: () => string | null | Promise<string | null>,
	{ authorize, files, save }: Pick<EvidencePorts, "authorize" | "files"> & { save(): unknown },
) {
	const record = state.records.find((candidate) => candidate.id === input.receiptId);
	if (!record?.evicted || state.used >= 2 || input.path !== record.path)
		throw new Error(
			"recovery-unavailable: only recorded evicted windows, twice per task; normal read budget remains active.",
		);
	const binding = await bindingProvider();
	if (binding !== record.binding) throw new Error("recovery-binding-changed");
	await authorize(cwd, record.path);
	await files.inspect(cwd, record.absolutePath || record.path, {
		sha256: record.sha256,
		rootKind: record.rootKind,
	});
	const text = (await files.readText(record.absolutePath || resolve(cwd, record.path)))
		.split(/\r?\n/)
		.slice(record.offset - 1, record.offset - 1 + record.limit)
		.join("\n")
		.slice(0, 16e3);
	await files.inspect(cwd, record.absolutePath || record.path, {
		sha256: record.sha256,
		rootKind: record.rootKind,
	});
	state.used++;
	record.evicted = false;
	save();
	return {
		status: "restored",
		path: record.path,
		sha256: record.sha256,
		...(record.rootKind ? { rootKind: record.rootKind } : {}),
		offset: record.offset,
		limit: record.limit,
		text,
		scientificallyVerified: false,
		remaining: 2 - state.used,
	};
}

function createEvidenceRecovery({ authorize, files, persist = () => undefined }: EvidencePorts) {
	const state: EvidenceState = { version: 1, scope: null, taskId: null, records: [], used: 0 };
	const save = () => persist({ ...state });
	return {
		checkpoint: () => structuredClone(state),
		rollback: (saved: EvidenceState) => {
			({
				scope: state.scope,
				taskId: state.taskId,
				records: state.records,
				used: state.used,
			} = structuredClone(saved));
		},
		scope: () => state.scope,
		attach(
			nextScope: string | null,
			nextTaskId: string | null | undefined,
			entries: readonly TaskEntry[] = [],
			force = false,
		) {
			if (!force && state.scope === nextScope && state.taskId === nextTaskId) return;
			state.scope = nextScope;
			state.taskId = nextTaskId;
			state.records = [];
			state.used = 0;
			for (const entry of entries) {
				const data = entry.data as Omit<EvidenceState, "version"> | null | undefined;
				if (
					entry.customType === "drone-task-evidence-v1" &&
					data?.scope === state.scope &&
					data.taskId === state.taskId &&
					Array.isArray(data.records) &&
					data.records.length <= 8
				) {
					state.records = structuredClone(data.records);
					state.used = Number(data.used) || 0;
				}
			}
		},
		capture: (event: EvidenceEvent, cwd: string, binding: string | null) =>
			captureEvidence(state, event, cwd, binding, files, save),
		evict(ids: unknown) {
			if (!Array.isArray(ids)) return;
			let changed = false;
			for (const record of state.records)
				if (ids.includes(record.id)) {
					record.evicted = true;
					changed = true;
				}
			if (changed) save();
		},
		restore: (
			input: Parameters<typeof restoreEvidence>[1],
			cwd: string,
			bindingProvider: Parameters<typeof restoreEvidence>[3],
		) => restoreEvidence(state, input, cwd, bindingProvider, { authorize, files, save }),
	};
}

export { createEvidenceRecovery };
