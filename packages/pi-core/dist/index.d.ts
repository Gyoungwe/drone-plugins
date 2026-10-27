import type { DroneHostPort } from "@gyoungwe/plugin-api";
import { type AskUserToolDeps } from "./tools/ask-user";
/** The deliberately small host seam used by pi-core. */
export type PiCoreHostPort = Pick<DroneHostPort, "host" | "capabilities" | "requestAuthorization">;
export interface PiCoreContext {
    readonly cwd?: string;
    readonly hasUI?: boolean;
    readonly sessionManager?: {
        getSessionId(): string;
    };
    readonly signal?: AbortSignal;
    readonly ui?: {
        select?: (title: string, options: string[], settings?: {
            signal?: AbortSignal;
        }) => Promise<string | undefined>;
        input?: (title: string, placeholder?: string, settings?: {
            signal?: AbortSignal;
        }) => Promise<string | undefined>;
        confirm?: (title: string, message?: string, settings?: {
            signal?: AbortSignal;
        }) => Promise<boolean>;
    };
}
export interface PiCoreRegistrationOptions {
    /** Desktop injects its existing ask gate through this callback. */
    ask?: AskUserToolDeps["ask"];
    /** Optional host contract for capability checks and task authorization. */
    host?: PiCoreHostPort;
}
/** Build a native-Pi host adapter without importing Desktop or backend code. */
export declare function createNativePiHostPort(ctx: PiCoreContext, hostVersion?: string): PiCoreHostPort;
/**
 * Register the portable core tools and task runtime on a Pi extension host.
 * Existing Desktop hosts can pass `ask`; native Pi hosts use `ctx.ui`.
 */
export declare function registerPiCore(pi: any, options?: PiCoreRegistrationOptions): {
    host: PiCoreHostPort | undefined;
    tools: string[];
};
export { buildDoctorReport, buildExampleReport, DRONE_COMMAND_SCHEMA_VERSION, PI_CORE_PACKAGE_VERSION, PI_HOST_RANGE, parseExampleArgs, registerDroneCommands, } from "./drone-commands";
export { forgetMemory, memoryIndexPrompt, writeMemory } from "./memory";
export { makeAskUserTool } from "./tools/ask-user";
export { deliverFilesParams, makeDeliverFilesTool } from "./tools/deliver-files";
export { MEMORY_SAVE_TOOL, makeMemorySaveTool } from "./tools/memory-save";
export { makeStatusTool } from "./tools/status";
export { formatTodoList, makeTodoTool, normalizeTodos } from "./tools/todo";
export { MAX_DELIVERED_FILES, TODO_TOOL_NAME, askDecisionHash, } from "./contracts";
export type { AskAnswer, AskDecision, AskDecisionProposal, AskOption, AskQuestion, AskQuestionType, AskRecommendation, AskRecommendationConfidence, AskRequest, AskRequestKind, AskResponse, TodoItem, TodoStatus, } from "./contracts";
export default registerPiCore;
