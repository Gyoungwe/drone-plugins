export { buildProxiedUrl, inferEzproxyTemplateFromUrl } from "./institutional-proxy.js";
export declare const INSTITUTIONAL_CONFIG_NAME = "institutional.json";
export declare const INSTITUTIONAL_AGENT_DIR: string;
export declare const INSTITUTIONAL_CONFIG_PATH: string;
export interface InstitutionalConfig {
    version: 1;
    ezproxyTemplate?: string;
    openUrlResolver?: string;
    institutionName?: string;
    autoDownloadEnabled: boolean;
    perTaskLimit: number;
    lastLoginAt?: string;
    lastLoginUrl?: string;
    configured?: boolean;
}
export interface InstitutionalConfigIo {
    readFile(path: string): Promise<string>;
    writeFile(path: string, data: string): Promise<void>;
    mkdir(path: string): Promise<void>;
}
export declare function emptyInstitutionalConfig(): InstitutionalConfig;
export declare function normalizeInstitutionalConfig(raw: unknown): InstitutionalConfig;
export declare function loadInstitutionalConfig(path?: string, io?: Pick<InstitutionalConfigIo, "readFile">): Promise<InstitutionalConfig>;
export declare function saveInstitutionalConfig(config: unknown, path?: string, io?: InstitutionalConfigIo): Promise<InstitutionalConfig>;
export declare function detectAndSaveTemplateFromUrl(navigatedUrl: string, { path, io }?: {
    path?: string;
    io?: InstitutionalConfigIo;
}): Promise<InstitutionalConfig | null>;
