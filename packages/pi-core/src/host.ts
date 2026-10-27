/**
 * Versioned host entry for portable backend-facing contracts.
 *
 * Desktop/backend consumers must use this entry instead of reaching through
 * the extension's root implementation path. The implementation remains in
 * pi-core; the host entry is the stable composition boundary.
 */
import { memoryIndexPrompt as memoryIndexPromptImpl, writeMemory as writeMemoryImpl } from "./memory";
import type { MemoryType } from "./memory";
import { makeDeliverFilesTool as makeDeliverFilesToolImpl } from "./tools/deliver-files";
import { makeMemorySaveTool as makeMemorySaveToolImpl } from "./tools/memory-save";
import { makeStatusTool as makeStatusToolImpl } from "./tools/status";
import { makeTodoTool as makeTodoToolImpl } from "./tools/todo";
import { acceptanceVerifier, registerAcceptanceVerifier } from "./task-runtime/acceptance.mjs";

interface CoreMemoryEntry {
	readonly name: string;
	readonly description: string;
	readonly type: MemoryType;
	readonly body: string;
}

interface CoreHostLoaderContract {
	readonly contractVersion: 1;
	readonly load: () => {
		readonly contractVersion: 1;
		readonly makeDeliverFilesTool: () => unknown;
		readonly makeMemorySaveTool: () => unknown;
		readonly makeStatusTool: () => unknown;
		readonly makeTodoTool: () => unknown;
		readonly memoryIndexPrompt: (cwd: string) => readonly string[];
		readonly writeMemory: (cwd: string, entry: CoreMemoryEntry) => string;
	};
}

export type { MemoryEntry, MemoryType } from "./memory";
export {
	forgetMemory,
	listMemories,
	MAX_INDEX_LINES,
	MEMORY_INDEX,
	MEMORY_TYPES,
	memoryDir,
	memoryIndexPrompt,
	memorySlug,
	parseMemory,
	renderMemoryIndex,
	serializeMemory,
	writeMemory,
} from "./memory";
export type { DeliverFilesDetails } from "./tools/deliver-files";
export { deliverFilesParams, makeDeliverFilesTool } from "./tools/deliver-files";
// Keep the legacy backend facades on the same versioned entry as memory.  The
// host entry is bundled and checked as a public package boundary; consumers do
// not reach through the extension root or private source paths.
export type { MemorySaveDetails } from "./tools/memory-save";
export { MEMORY_SAVE_TOOL, makeMemorySaveTool } from "./tools/memory-save";
export type { StatusToolDetails } from "./tools/status";
export { makeStatusTool } from "./tools/status";
export { formatTodoList, makeTodoTool, normalizeTodos } from "./tools/todo";

/**
 * Versioned host loader discovered from the declared Drone host entrypoint.
 *
 * Keep this object structural so pi-core remains installable with the oldest
 * supported plugin-api package; the public contract is defined by
 * `@gyoungwe/plugin-api/core` and checked by the Desktop composition root.
 */
export const coreHostLoader = {
	contractVersion: 1 as const,
	load: () => ({
		contractVersion: 1 as const,
		makeDeliverFilesTool: makeDeliverFilesToolImpl,
		makeMemorySaveTool: makeMemorySaveToolImpl,
		makeStatusTool: makeStatusToolImpl,
		makeTodoTool: makeTodoToolImpl,
		memoryIndexPrompt: memoryIndexPromptImpl,
		writeMemory: (cwd: string, entry: CoreMemoryEntry) => writeMemoryImpl(cwd, { ...entry }),
	}),
} satisfies CoreHostLoaderContract;

interface TaskHostLoaderContract {
	readonly contractVersion: 1;
	readonly load: () => {
		readonly contractVersion: 1;
		readonly registerAcceptanceVerifier: (kind: string, definition: Readonly<Record<string, unknown>>) => void;
		readonly readAcceptanceVerifier: (kind: string) => unknown;
	};
}

/** Optional tasks host discovered by Drone Desktop from the same Pi package. */
export const taskHostLoader = {
	contractVersion: 1 as const,
	load: () => ({
		contractVersion: 1 as const,
		registerAcceptanceVerifier: (kind: string, definition: Readonly<Record<string, unknown>>) => {
			registerAcceptanceVerifier(kind, definition);
		},
		readAcceptanceVerifier: (kind: string) => acceptanceVerifier(kind),
	}),
} satisfies TaskHostLoaderContract;
