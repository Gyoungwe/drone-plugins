export { zoteroMcpSpec } from "./zotero-setup.js";
type SetupOptions = Record<string, any>;
type SetupRecord = Record<string, any>;
export declare const ZOTERO_SETUP_BINDING: Readonly<{
    uvScript: "https://astral.sh/uv/install.sh" | "https://astral.sh/uv/install.ps1";
    command: "zotero-setup";
    skill: "zotero-literature";
    mcpServer: "zotero";
    package: "zotero-mcp-server";
    docs: "https://github.com/54yyyu/zotero-mcp";
    download: "https://www.zotero.org/download";
    localApi: "http://127.0.0.1:23119/api";
}>;
export declare function resolveZoteroCommands({ whichImpl, homeDir, extraBinDirs, }?: SetupOptions): Promise<{
    zoteroCli: any;
    zoteroMcp: any;
}>;
export declare function probeZoteroLocalApi({ fetchImpl, url, timeoutMs, }?: SetupOptions): Promise<{
    reachable: boolean;
    status: any;
    url: any;
    error?: undefined;
} | {
    reachable: boolean;
    url: any;
    error: string;
    status?: undefined;
}>;
export declare function readZoteroMcp({ agentDirectory }?: Record<string, any>): Promise<{
    command: string | null;
    disabled: boolean;
    registered: boolean;
    path: string;
}>;
export declare function registerZoteroMcp({ agentDirectory, command, enable, libraryType, }?: Record<string, any>): Promise<{
    command: string | null;
    disabled: boolean;
    registered: boolean;
    path: string;
}>;
export declare function resolveInstallers({ whichImpl, execFileImpl, homeDir, }?: SetupOptions): Promise<{
    uv: any;
    pipx: any;
    python: SetupRecord | null;
    preferred: SetupRecord;
    installers: SetupRecord[];
    canBootstrapUv: boolean;
    uvScript: "https://astral.sh/uv/install.sh" | "https://astral.sh/uv/install.ps1";
}>;
export declare function uvBootstrapCommand(): {
    file: string;
    args: string[];
};
export declare function installZoteroMcp({ installer, execFileImpl, whichImpl, homeDir, }?: SetupOptions): Promise<{
    extraBinDirs: string[];
    commands: {
        zoteroCli: any;
        zoteroMcp: any;
    };
    stdout: string;
    stderr: string;
    action: string;
    installer: any;
}>;
export declare function installUv({ execFileImpl, whichImpl, homeDir, }?: SetupOptions): Promise<{
    installer: {
        name: string;
        file: any;
        args: string[];
    };
    stdout: string;
    stderr: string;
    action: string;
}>;
export declare function inspectZotero({ agentDirectory, fetchImpl, whichImpl, execFileImpl, homeDir, }?: SetupOptions): Promise<{
    binding: Readonly<{
        uvScript: "https://astral.sh/uv/install.sh" | "https://astral.sh/uv/install.ps1";
        command: "zotero-setup";
        skill: "zotero-literature";
        mcpServer: "zotero";
        package: "zotero-mcp-server";
        docs: "https://github.com/54yyyu/zotero-mcp";
        download: "https://www.zotero.org/download";
        localApi: "http://127.0.0.1:23119/api";
    }>;
    commands: {
        zoteroCli: any;
        zoteroMcp: any;
    };
    localApi: {
        reachable: boolean;
        status: any;
        url: any;
        error?: undefined;
    } | {
        reachable: boolean;
        url: any;
        error: string;
        status?: undefined;
    };
    mcp: {
        command: string | null;
        disabled: boolean;
        registered: boolean;
        path: string;
    };
    desktop: {
        detected: boolean;
        path: string | null;
    };
    installers: {
        uv: any;
        pipx: any;
        python: SetupRecord | null;
        preferred: SetupRecord;
        installers: SetupRecord[];
        canBootstrapUv: boolean;
        uvScript: "https://astral.sh/uv/install.sh" | "https://astral.sh/uv/install.ps1";
    };
    install: {
        package: "zotero-mcp-server";
        docs: "https://github.com/54yyyu/zotero-mcp";
        download: "https://www.zotero.org/download";
        hint: string;
    };
    zoteroSettings: string;
    boundary: string;
    remaining: {
        id: string;
        text: string;
    }[];
}>;
export declare function bootstrapZotero({ agentDirectory, confirm, fetchImpl, whichImpl, execFileImpl, homeDir, enableMcp, }?: SetupOptions): Promise<{
    cancelled: string;
    status: {
        binding: Readonly<{
            uvScript: "https://astral.sh/uv/install.sh" | "https://astral.sh/uv/install.ps1";
            command: "zotero-setup";
            skill: "zotero-literature";
            mcpServer: "zotero";
            package: "zotero-mcp-server";
            docs: "https://github.com/54yyyu/zotero-mcp";
            download: "https://www.zotero.org/download";
            localApi: "http://127.0.0.1:23119/api";
        }>;
        commands: {
            zoteroCli: any;
            zoteroMcp: any;
        };
        localApi: {
            reachable: boolean;
            status: any;
            url: any;
            error?: undefined;
        } | {
            reachable: boolean;
            url: any;
            error: string;
            status?: undefined;
        };
        mcp: {
            command: string | null;
            disabled: boolean;
            registered: boolean;
            path: string;
        };
        desktop: {
            detected: boolean;
            path: string | null;
        };
        installers: {
            uv: any;
            pipx: any;
            python: SetupRecord | null;
            preferred: SetupRecord;
            installers: SetupRecord[];
            canBootstrapUv: boolean;
            uvScript: "https://astral.sh/uv/install.sh" | "https://astral.sh/uv/install.ps1";
        };
        install: {
            package: "zotero-mcp-server";
            docs: "https://github.com/54yyyu/zotero-mcp";
            download: "https://www.zotero.org/download";
            hint: string;
        };
        zoteroSettings: string;
        boundary: string;
        remaining: {
            id: string;
            text: string;
        }[];
    };
    steps: SetupRecord[];
    remaining?: undefined;
} | {
    cancelled: null;
    status: {
        binding: Readonly<{
            uvScript: "https://astral.sh/uv/install.sh" | "https://astral.sh/uv/install.ps1";
            command: "zotero-setup";
            skill: "zotero-literature";
            mcpServer: "zotero";
            package: "zotero-mcp-server";
            docs: "https://github.com/54yyyu/zotero-mcp";
            download: "https://www.zotero.org/download";
            localApi: "http://127.0.0.1:23119/api";
        }>;
        commands: {
            zoteroCli: any;
            zoteroMcp: any;
        };
        localApi: {
            reachable: boolean;
            status: any;
            url: any;
            error?: undefined;
        } | {
            reachable: boolean;
            url: any;
            error: string;
            status?: undefined;
        };
        mcp: {
            command: string | null;
            disabled: boolean;
            registered: boolean;
            path: string;
        };
        desktop: {
            detected: boolean;
            path: string | null;
        };
        installers: {
            uv: any;
            pipx: any;
            python: SetupRecord | null;
            preferred: SetupRecord;
            installers: SetupRecord[];
            canBootstrapUv: boolean;
            uvScript: "https://astral.sh/uv/install.sh" | "https://astral.sh/uv/install.ps1";
        };
        install: {
            package: "zotero-mcp-server";
            docs: "https://github.com/54yyyu/zotero-mcp";
            download: "https://www.zotero.org/download";
            hint: string;
        };
        zoteroSettings: string;
        boundary: string;
        remaining: {
            id: string;
            text: string;
        }[];
    };
    steps: SetupRecord[];
    remaining: {
        id: string;
        text: string;
    }[];
}>;
export declare function setupZoteroAgentMessage({ status, bootstrap, preferences }: SetupOptions): string;
