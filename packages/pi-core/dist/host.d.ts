/**
 * Versioned host entry for portable backend-facing contracts.
 *
 * Desktop/backend consumers must use this entry instead of reaching through
 * the extension's root implementation path. The implementation remains in
 * pi-core; the host entry is the stable composition boundary.
 */
import type { MemoryType } from "./memory";
import { memoryIndexPrompt as memoryIndexPromptImpl } from "./memory";
import { normalizeTaskMilestones } from "./milestone-plan";
import type { PluginNativeSession } from "@gyoungwe/plugin-api/native";
import type { TaskAcceptanceVerifier } from "./task-runtime/acceptance.mjs";
import { makeDeliverFilesTool as makeDeliverFilesToolImpl } from "./tools/deliver-files";
import { makeMemorySaveTool as makeMemorySaveToolImpl } from "./tools/memory-save";
import { makeStatusTool as makeStatusToolImpl } from "./tools/status";
import { makeTodoTool as makeTodoToolImpl } from "./tools/todo";
interface CoreMemoryEntry {
    readonly name: string;
    readonly description: string;
    readonly type: MemoryType;
    readonly body: string;
}
export type { MemoryEntry, MemoryType } from "./memory";
export { forgetMemory, listMemories, MAX_INDEX_LINES, MEMORY_INDEX, MEMORY_TYPES, memoryDir, memoryIndexPrompt, memorySlug, parseMemory, renderMemoryIndex, serializeMemory, writeMemory, } from "./memory";
export type { DeliverFilesDetails } from "./tools/deliver-files";
export { deliverFilesParams, makeDeliverFilesTool, } from "./tools/deliver-files";
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
export declare const coreHostLoader: {
    contractVersion: 1;
    load: () => {
        contractVersion: 1;
        makeDeliverFilesTool: typeof makeDeliverFilesToolImpl;
        makeMemorySaveTool: typeof makeMemorySaveToolImpl;
        makeStatusTool: typeof makeStatusToolImpl;
        makeTodoTool: typeof makeTodoToolImpl;
        memoryIndexPrompt: typeof memoryIndexPromptImpl;
        writeMemory: (cwd: string, entry: CoreMemoryEntry) => string;
    };
};
interface WorkbenchPluginClient {
    readonly invoke: (operation: string, input: unknown, signal?: AbortSignal) => Promise<unknown>;
    readonly subscribe: (listener: (event: {
        readonly type: "changed";
        readonly revision: number;
    }) => void) => () => void;
}
/** Optional tasks host discovered by Drone Desktop from the same Pi package. */
export declare const taskHostLoader: {
    contractVersion: 1;
    load: (input?: {
        readonly workbench?: WorkbenchPluginClient;
    }) => {
        workbench?: WorkbenchPluginClient | undefined;
        contractVersion: 1;
        registerAcceptanceVerifier: (kind: string, definition: Readonly<Record<string, unknown>>) => TaskAcceptanceVerifier;
        readAcceptanceVerifier: (kind: string) => TaskAcceptanceVerifier | null;
        normalizeMilestones: typeof normalizeTaskMilestones;
        createNativeSession: () => PluginNativeSession;
        dispose: () => Promise<void>;
    };
};
export { normalizeTaskMilestones } from "./milestone-plan";
