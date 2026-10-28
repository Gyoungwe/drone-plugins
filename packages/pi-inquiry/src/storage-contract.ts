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

/** Host-facing storage boundary. A backend may implement this with SQLite. */
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
	| FindingRecord
	| QuestionRecord
	| AttemptRecord
	| DecisionRecord
	| ArtifactRerunRecord;
