import { realpath } from "node:fs/promises";
import {
	ReceiptJournalBuffer,
	receiptBelongsToRun,
	shouldRecordResearchReceipt,
} from "./receipt-journal-policy.js";

export interface ResearchJournalWorkspace {
	obsidianVault?: string | null;
	knowledgeBindingRevision?: number | null;
}

export interface ResearchJournalPorts {
	workspace(cwd: string): Promise<ResearchJournalWorkspace>;
	status(cwd: string, runDir: string): Promise<{ run_dir: string }>;
	flush(cwd: string, runDir: string): Promise<void>;
	reset(cwd: string, runDir: string): void;
	observeExecution(event: ScopedReceipt): Promise<unknown>;
	observeResearch(event: ScopedReceipt): Promise<unknown>;
	isJournalTool?(toolName: string): boolean;
	owners?: Map<string, symbol>;
}

export interface ResearchReceiptEvent {
	toolName?: string;
	toolCallId?: string;
	isError?: boolean;
	countedStep?: boolean;
	args?: Record<string, unknown>;
	details?: Record<string, unknown>;
	[key: string]: unknown;
}

type ScopedReceipt = ResearchReceiptEvent & { cwd: string; runDir: string; sessionId: string | null };
type BufferedReceipt = ResearchReceiptEvent & { boundRun?: string };
type JournalState = {
	cwd: string;
	sessionId: string | null;
	ports: ResearchJournalPorts;
	owners: Map<string, symbol>;
	owner: symbol;
	buffer: ReceiptJournalBuffer<BufferedReceipt>;
	runs: Set<string>;
	active: boolean;
	currentRun?: string;
	tail: Promise<void>;
};

function serial<T>(state: JournalState, work: () => Promise<T>) {
	const next = state.tail.then(work);
	state.tail = next.then(
		() => undefined,
		() => undefined,
	);
	return next;
}

async function forward(state: JournalState, receipt: BufferedReceipt, runDir: string) {
	if (receipt.boundRun && receipt.boundRun !== runDir) return null;
	const { cwd, sessionId, ports } = state;
	const scoped = { ...receipt, cwd, runDir, sessionId };
	if (!receiptBelongsToRun(receipt, cwd, runDir)) {
		return receipt.boundRun ? ports.observeResearch({ ...scoped, isError: true, details: {} }) : null;
	}
	await ports.observeExecution(scoped);
	return ports.observeResearch(scoped);
}

async function attach(state: JournalState, runDir: string) {
	const { cwd, ports, owners, owner, runs, buffer } = state;
	const { run_dir: path } = await ports.status(cwd, runDir);
	if (owners.has(path) && owners.get(path) !== owner)
		throw new Error("Research run is owned by another active session/turn; create a separate run");
	if (!runs.has(path)) {
		owners.set(path, owner);
		await ports.flush(cwd, path);
		ports.reset(cwd, path);
		runs.add(path);
		for (const receipt of buffer.values()) await forward(state, receipt, path);
	}
	state.currentRun = path;
}

function record(state: JournalState, event: ResearchReceiptEvent) {
	const { cwd, ports } = state;
	if (!state.active || (!event.countedStep && !shouldRecordResearchReceipt(event, ports.isJournalTool)))
		return Promise.resolve(null);
	const snapshot =
		event.toolName === "research_read_knowledge"
			? ports
					.workspace(cwd)
					.then(async (config) => ({
						vault: config.obsidianVault ? await realpath(config.obsidianVault) : null,
						revision: config.knowledgeBindingRevision || 0,
					}))
					.catch(() => ({ vault: null, revision: -1 }))
			: undefined;
	const receipt: BufferedReceipt = {
		...structuredClone(event),
		sessionId: state.sessionId,
		observedAt: new Date().toISOString(),
		boundRun: event.countedStep ? state.currentRun : undefined,
	};
	return serial(state, async () => {
		if (!state.active || !state.buffer.add(receipt)) return null;
		receipt.readBinding = await snapshot;
		return state.currentRun ? forward(state, receipt, state.currentRun) : null;
	});
}

/** Host-injected journal; the package owns bounds, deduplication and run scope. */
export function createResearchReceiptJournal(
	cwd: string,
	{ sessionId = null, ports }: { sessionId?: string | null; ports: ResearchJournalPorts },
) {
	const state: JournalState = {
		cwd,
		sessionId,
		ports,
		owners: ports.owners ?? new Map(),
		owner: Symbol("research-turn"),
		buffer: new ReceiptJournalBuffer(),
		runs: new Set(),
		active: true,
		tail: Promise.resolve(),
	};
	return {
		currentRun: () => state.currentRun,
		record: (event: ResearchReceiptEvent) => record(state, event),
		execute<T extends Record<string, unknown>>(runDir: string | null | undefined, work: () => Promise<T>) {
			return serial(state, async () => {
				if (!state.active) throw new Error("Research turn has ended");
				if (runDir) await attach(state, runDir);
				const result = await work();
				if (typeof result.run_dir === "string") await attach(state, result.run_dir);
				const refreshed =
					typeof result.run_dir === "string" ? await ports.status(cwd, result.run_dir) : result;
				return {
					...result,
					...refreshed,
					receipt_journal: state.buffer.snapshot(),
				};
			});
		},
		async close() {
			state.active = false;
			await state.tail;
			for (const runDir of state.runs) {
				await ports.flush(cwd, runDir);
				if (state.owners.get(runDir) === state.owner) {
					ports.reset(cwd, runDir);
					state.owners.delete(runDir);
				}
			}
			state.runs.clear();
			state.buffer.clear();
		},
	};
}
