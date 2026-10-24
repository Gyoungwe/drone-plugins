export interface WorkspaceConfig {
    resultsRoot: string;
}
export type WorkspaceConfigLoader = (cwd: string) => Promise<WorkspaceConfig>;
export interface ExecutionReceiptInput {
    cwd: string;
    runDir: string;
    toolCallId: string;
    toolName: string;
    sessionId?: string | null;
    args?: Record<string, unknown>;
    details?: Record<string, unknown>;
    isError?: boolean;
    observedAt?: string;
    loadWorkspaceConfig?: WorkspaceConfigLoader;
}
export interface ProvenanceFileDeclaration {
    path: string;
    role: "input" | "output" | "script" | "log";
}
export interface RunProvenanceInput {
    cwd?: string;
    runDir: string;
    files?: ProvenanceFileDeclaration[];
    declarations?: Record<string, unknown>;
    loadWorkspaceConfig?: WorkspaceConfigLoader;
}
interface ObservationRecord {
    toolCallId: string;
    toolName: string;
    sessionId: string | null;
    observedAt: string;
    cwd: string;
    commandSha256: string;
    commandLocation: "original-session-tool-call";
    resultDetailsSha256: string;
    outcome: "failed-or-blocked" | "tool-returned";
    exitCode: number | null;
    executionConfirmed: boolean;
    qcVerified: false;
}
/** Called only from actual host tool-end events. No raw commands/output (may contain credentials). */
export declare function observeExecutionReceipt({ cwd, runDir, toolCallId, toolName, sessionId, args, details, isError, observedAt, loadWorkspaceConfig, }: ExecutionReceiptInput): Promise<null | undefined>;
/** File hashes are observed now, not retroactively claimed to be execution-time inputs. */
export declare function recordRunProvenance({ cwd, runDir, files, declarations, loadWorkspaceConfig, }: RunProvenanceInput): Promise<RunProvenanceResult>;
export interface ProvenanceSnapshot {
    path: string;
    role: ProvenanceFileDeclaration["role"];
    bytes: number;
    sha256: string;
    snapshotAt: string;
    basis: "current-file-snapshot-not-execution-time-proof";
}
export interface RunProvenanceManifest {
    version: 1;
    createdAt: string;
    runDir: string;
    hostRuntime: {
        node: string;
        platform: string;
        arch: string;
    };
    files: ProvenanceSnapshot[];
    executionObservations: ObservationRecord[];
    declarations: Record<string, unknown>;
    declaredSoftwareVersionsVerified: false;
    qcVerified: false;
    scientificallyVerified: false;
    executionStatus: "tool-observations-present" | "no-execution-observed";
    limitations: string[];
}
export interface RunProvenanceResult extends RunProvenanceManifest {
    path: string;
}
export interface MethodsFacts {
    runDir: string;
    query: string | null;
    status: string | null;
    startedAt: string | null;
    finalizedAt: string | null;
    hostRuntime: RunProvenanceManifest["hostRuntime"] | null;
    inputs: {
        path: string;
        sha256: string;
    }[];
    outputs: {
        path: string;
        sha256: string;
    }[];
    scripts: {
        path: string;
        sha256: string;
    }[];
    /** 模型/用户在 research_record_run_manifest 里声明的软件版本、参数、种子、计算模块（未经独立验证） */
    declarations: Record<string, unknown>;
    commandsObserved: number;
    commandsFailed: number;
    existingMethods: string | null;
    gaps: string[];
}
/**
 * 从运行目录收集写 Methods 段需要的事实：运行时间、输入/输出/脚本快照、声明的软件版本与参数、
 * 命令执行回执计数。缺失项列在 gaps 里，模型不得自行补全版本号或参数。
 */
export declare function readMethodsFacts({ cwd, runDir, loadWorkspaceConfig, }: {
    cwd?: string;
    runDir: string;
    loadWorkspaceConfig?: WorkspaceConfigLoader;
}): Promise<MethodsFacts>;
/** 写入用户已确认的 Methods 段（METHODS.md，原子替换）；确认由调用方负责 */
export declare function saveMethodsSection({ cwd, runDir, text: body, approvedAt, loadWorkspaceConfig, }: {
    cwd?: string;
    runDir: string;
    text: string;
    approvedAt?: string;
    loadWorkspaceConfig?: WorkspaceConfigLoader;
}): Promise<{
    path: string;
    bytes: number;
}>;
export {};
