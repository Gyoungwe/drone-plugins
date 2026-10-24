import { type LiteratureReceiptOptions } from "./literature-receipt.js";
/**
 * Pure recovery policy for literature destination writes.
 *
 * The host adapter owns journal persistence, workspace validation, scheduling
 * and destination inspection. This package owns operation identity and journal
 * transitions; an uncertain write can never be retried or overwritten implicitly.
 */
export interface LiteratureDestinationReceipt {
    zotero?: {
        status?: string | null;
    } | null;
    obsidian?: {
        status?: string | null;
    } | null;
}
export interface DestinationRecovery {
    zotero: {
        status: string;
        action: string;
        autoWrite: false;
    };
    obsidian: {
        status: string;
        action: string;
        autoWrite: false;
    };
    completed: boolean;
    scientificallyVerified: false;
}
export declare function destinationRecovery(receipt?: LiteratureDestinationReceipt): DestinationRecovery;
export interface LiteratureOperationReceipt extends LiteratureDestinationReceipt {
    [key: string]: unknown;
}
export interface LiteratureOperationInput {
    cwd?: string;
    runDir: string;
    doi: unknown;
    zoteroKey: string;
    notePath: string;
}
export interface LiteratureOperationLocation {
    file: string;
    /** Canonical, validated Vault path, supplied by the host. */
    vault: string | null;
    revision: number;
}
export interface LiteratureOperationRecord {
    id: string;
    doi: string;
    zoteroKey: string;
    notePath: string;
    vault: string;
    revision: number;
    status: "both-identities-verified" | "partial-or-unavailable";
    attempts: number;
    createdAt: string;
    checkedAt: string;
    destinations: DestinationRecovery;
    receipt: LiteratureOperationReceipt;
    history: Array<{
        at: string;
        zotero: string | null | undefined;
        obsidian: string | null | undefined;
    }>;
}
export interface ZoteroWriteReceipt {
    doi?: unknown;
    status?: unknown;
    reason?: unknown;
    channel?: unknown;
    zoteroKey?: unknown;
    library?: unknown;
    collection?: unknown;
    attachment?: unknown;
    fulltextStatus?: unknown;
    readBack?: unknown;
    consent?: unknown;
    writesToLibraries?: number;
    write?: {
        at?: string;
    } | null;
}
export interface LiteratureWriteRecord {
    id: string;
    doi: string;
    status: string;
    reason: unknown;
    channel: unknown;
    zoteroKey: unknown;
    library: unknown;
    collection: unknown;
    attachment: unknown;
    fulltextStatus: unknown;
    readBack: unknown;
    consent: unknown;
    writesToLibraries: number;
    at: string;
}
export interface LiteratureOperationJournal {
    version: 1;
    operations: Record<string, LiteratureOperationRecord>;
    writes?: LiteratureWriteRecord[];
}
export type LiteratureOperationVerifier = (input: LiteratureReceiptOptions) => Promise<LiteratureOperationReceipt>;
/** All IO and queue ownership belong to one explicit host instance. */
export interface LiteratureOperationPorts {
    resolveRunJournal(cwd: string, runDir: string): Promise<LiteratureOperationLocation>;
    readJournal(file: string): Promise<LiteratureOperationJournal>;
    writeJournal(file: string, journal: LiteratureOperationJournal): Promise<void>;
    exclusive<T>(file: string, work: () => Promise<T>): Promise<T>;
    verify: LiteratureOperationVerifier;
    now?: () => string;
    createId?: () => string;
}
export declare function literatureOperationId(vault: string, revision: number, doi: unknown): string;
/** Reconcile destination identity and record observations; never perform a library write. */
export declare function createLiteratureOperations(ports: LiteratureOperationPorts): {
    reconcileLiteratureOperation({ cwd, runDir, doi, zoteroKey, notePath }: LiteratureOperationInput, { verify }?: {
        verify?: LiteratureOperationVerifier;
    }): Promise<{
        operation_id: string;
        log_path: string;
        status: "both-identities-verified" | "partial-or-unavailable";
        destinations: DestinationRecovery;
        receipt: LiteratureOperationReceipt;
        attempts: number;
        writesToLibraries: 0;
    }>;
    /** Append an observed write receipt; the journal never authorizes or drives a retry. */
    recordZoteroWrite({ cwd, runDir, receipt, }: {
        cwd?: string;
        runDir: string;
        receipt: ZoteroWriteReceipt;
    }): Promise<{
        write_id: string;
        log_path: string;
        writes: number;
        autoRetry: false;
    }>;
};
