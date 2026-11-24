import type {
	ArtifactRecord,
	ArtifactRerunRecord,
	AttemptRecord,
	DecisionRecord,
	FindingRecord,
	InquirySnapshot,
	QuestionRecord,
} from "./models.js";

export interface LedgerCollection<T extends { readonly id: string }> {
	get(id: string): Promise<T | undefined>;
	list(): Promise<readonly T[]>;
	put(record: T): Promise<void>;
}

export interface ArtifactLedger extends LedgerCollection<ArtifactRecord> {}
export interface FindingLedger extends LedgerCollection<FindingRecord> {}
export interface QuestionLedger extends LedgerCollection<QuestionRecord> {}
export interface AttemptLedger extends LedgerCollection<AttemptRecord> {}
export interface DecisionLedger extends LedgerCollection<DecisionRecord> {}
export interface ArtifactRerunLedger extends LedgerCollection<ArtifactRerunRecord> {}

/**
 * Durable marker of the consumed host-fact prefix.
 *
 * The marker belongs to the canonical owner's own projection store and is
 * written in the same transaction as the projected rows, so the projection and
 * the cursor can never disagree.
 */
export interface FactCursorRecord {
	readonly key: string;
	readonly factId: string;
	readonly sequence: number;
	readonly sha256: string;
	readonly updatedAt: string;
}

/** Transactional projection store of one canonical owner. */
export interface FactProjectionStore {
	/** The committed cursor marker of one scope, if any. */
	cursor(key: string): Promise<FactCursorRecord | undefined>;
	/**
	 * Apply the projected rows and the cursor marker atomically.
	 *
	 * A rejected mutation leaves both the rows and the marker unchanged.
	 */
	commit(input: {
		readonly cursor?: FactCursorRecord;
		readonly attempts?: readonly AttemptRecord[];
		readonly decisions?: readonly DecisionRecord[];
	}): Promise<void>;
}

/** Host-facing storage boundary. A backend may implement it with SQLite. */
export interface InquiryStorage {
	readonly projectId: string;
	readonly artifacts: ArtifactLedger;
	readonly findings: FindingLedger;
	readonly questions: QuestionLedger;
	readonly attempts: AttemptLedger;
	readonly decisions: DecisionLedger;
	readonly reruns: ArtifactRerunLedger;
	snapshot(): Promise<InquirySnapshot>;
	close?(): Promise<void>;
	/**
	 * Commit projected rows and the consumed-fact cursor in one transaction.
	 *
	 * A store without this capability cannot own a fact projection; the host
	 * contract requires the projection and the cursor to advance together.
	 */
	factProjection?(): FactProjectionStore;
}

/** Minimal shape accepted by the package so it does not import backend types. */
export interface InquiryStorageRegistry {
	register(entry: InquiryStorageEntry): unknown;
}

export interface InquiryStorageEntry {
	readonly id: "inquiry-root" | "inquiry-ledger";
	readonly path: string;
	readonly owner: "inquiry" | "inquiry/ledger";
	readonly schema: 1;
	readonly sensitivity: "private";
}

export const INQUIRY_STORAGE_IDS = Object.freeze({
	root: "inquiry-root",
	ledger: "inquiry-ledger",
} as const);

/** Register inquiry's durable root and ledger through a host registry adapter. */
export function registerInquiryStorage(
	registry: InquiryStorageRegistry,
	rootPath: string,
): readonly InquiryStorageEntry[] {
	if (!rootPath.trim()) throw new Error("Inquiry storage root cannot be empty");
	const entries: readonly InquiryStorageEntry[] = [
		{
			id: INQUIRY_STORAGE_IDS.root,
			path: rootPath,
			owner: "inquiry",
			schema: 1,
			sensitivity: "private",
		},
		{
			id: INQUIRY_STORAGE_IDS.ledger,
			path: `${rootPath.replace(/[\\/]$/, "")}/ledger.sqlite`,
			owner: "inquiry/ledger",
			schema: 1,
			sensitivity: "private",
		},
	];
	for (const entry of entries) registry.register(entry);
	return entries;
}

export type PersistedLedgerRecord =
	| ArtifactRecord
	| ArtifactRerunRecord
	| AttemptRecord
	| DecisionRecord
	| FindingRecord
	| QuestionRecord;
