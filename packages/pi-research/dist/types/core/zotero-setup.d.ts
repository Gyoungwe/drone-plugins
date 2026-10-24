/**
 * Host-independent Zotero setup policy.
 *
 * This module deliberately contains no filesystem, process, network or
 * credential access.  The CLI/desktop adapter owns those effects and calls
 * these functions only to validate and shape configuration values.
 */
export declare const ZOTERO_SETUP_BINDING: Readonly<{
    command: "zotero-setup";
    skill: "zotero-literature";
    mcpServer: "zotero";
    package: "zotero-mcp-server";
    docs: "https://github.com/54yyyu/zotero-mcp";
    download: "https://www.zotero.org/download";
    localApi: "http://127.0.0.1:23119/api";
    uvScript: "https://astral.sh/uv/install.sh";
}>;
export interface ZoteroMcpServerEntry {
    command: string | null;
    disabled: boolean;
    registered: boolean;
}
type JsonRecord = Record<string, unknown>;
/**
 * Tools hidden by default in the registered MCP server (Pi `toolExposure: "hidden"`, translated by
 * pi-mcp-adapter into `excludeTools`): deletes stay a manual Zotero action.
 */
export declare const ZOTERO_MCP_HIDDEN_TOOLS: readonly string[];
/**
 * Entry written to Pi's user-level `mcp.json`. Only fields pi-mcp-adapter 5.x translates for that
 * file are used (`command`/`args`/`env`/`description`/`timeout`/`toolExposure`/`enabled`); `disabled`
 * is not a Pi field and would be ignored (the server would start anyway).
 * - `ZOTERO_LIBRARY_TYPE` is explicit and singular (`user`/`group`): pyzotero appends the "s" itself,
 *   so an inherited plural value from older Drone builds produced `/userss/<id>` URLs.
 * - `ZOTERO_MCP_TOOLSETS=none` keeps the core tools only (search/read/add/collections/attach).
 * - Web API credentials are not written here; the child inherits `ZOTERO_API_KEY`/`ZOTERO_LIBRARY_ID`
 *   (or the Zotero 10 local key) from the host environment set up in Drone Settings → Zotero.
 */
export declare function zoteroMcpSpec(command: string, { enabled, libraryType }?: {
    enabled?: boolean;
    libraryType?: "user" | "group";
}): {
    enabled?: false | undefined;
    command: string;
    args: string[];
    env: {
        ZOTERO_LOCAL: string;
        ZOTERO_LIBRARY_TYPE: string;
        ZOTERO_MCP_TOOLSETS: string;
    };
    description: string;
    timeout: number;
    toolExposure: Record<string, "hidden">;
};
/** Read one Zotero MCP registration from an already parsed (Pi-format) config object. */
export declare function readZoteroMcpConfig(value: unknown): ZoteroMcpServerEntry;
/**
 * Merge a registration into a parsed Pi-format MCP config. User-set fields and env values are kept;
 * missing defaults are filled in; a bare PATH command is upgraded to the resolved absolute path; a
 * plural `ZOTERO_LIBRARY_TYPE` is rewritten singular; legacy `disabled` is replaced by `enabled`.
 * The enabled-state of an existing entry is preserved unless `enable` is set. The host adapter is
 * responsible for atomic persistence and must never log this return value.
 */
export declare function mergeZoteroMcpConfig(value: unknown, command: string, { enable, libraryType }?: {
    enable?: boolean;
    libraryType?: "user" | "group";
}): JsonRecord;
export interface ZoteroSetupStatus {
    commands: {
        zoteroCli?: string | null;
        zoteroMcp?: string | null;
    };
    localApi: {
        reachable: boolean;
    };
    desktop?: boolean;
}
/** Compute user-visible setup work from observed state; no probing or writes. */
export declare function remainingZoteroSetupSteps(status: ZoteroSetupStatus): {
    id: string;
    text: string;
}[];
export {};
