export { DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS, SOURCE_CATEGORIES } from "./source-archive-policy.js";
export interface SourceArchiveWorkspace {
    resultsRoot: string;
    obsidianVault?: string | null;
}
export interface SourceArchivePorts {
    workspace(cwd: string): Promise<SourceArchiveWorkspace>;
    publishSourceNote(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    exclusive<T>(key: string, work: () => Promise<T>): Promise<T>;
    loadInstitutionalConfig?(): Promise<Record<string, unknown> | null>;
    isElectronAvailable?(): boolean;
    institutionalFetch?(url: string, options?: Record<string, unknown>): Promise<any>;
    buildProxiedUrl?(url: string, template: string): string;
    /** One Cloudflare card for this call. Missing means keep today's browser_required result. */
    askCloudflare?(url: string, signal?: AbortSignal): Promise<"continue" | "skip">;
}
type ArchiveOptions = Record<string, any>;
export declare function archiveSource(options: ArchiveOptions | undefined, ports: SourceArchivePorts): Promise<Record<string, any>>;
export declare function sourceStatus(options: ArchiveOptions | undefined, ports: SourceArchivePorts): Promise<Record<string, any>>;
declare const _default: {
    archiveSource: typeof archiveSource;
    sourceStatus: typeof sourceStatus;
};
export default _default;
