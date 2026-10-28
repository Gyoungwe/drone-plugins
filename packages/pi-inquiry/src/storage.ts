import { CanonicalSqliteInquiryStorage } from "./sqlite-storage.js";
import type {
	ArtifactLedger,
	ArtifactRerunLedger,
	AttemptLedger,
	DecisionLedger,
	FindingLedger,
	InquiryStorage,
	LedgerCollection,
	PersistedLedgerRecord,
	QuestionLedger,
} from "./storage-contract.js";
export { INQUIRY_STORAGE_IDS, registerInquiryStorage } from "./storage-contract.js";
export type {
	ArtifactLedger,
	ArtifactRerunLedger,
	AttemptLedger,
	DecisionLedger,
	FindingLedger,
	InquiryStorage,
	InquiryStorageEntry,
	InquiryStorageRegistry,
	LedgerCollection,
	QuestionLedger,
} from "./storage-contract.js";
import { mkdirSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateArtifactLineage, validateFindingReferences } from "./lineage.js";
import {
	type ArtifactRecord,
	type ArtifactRerunRecord,
	type AttemptRecord,
	type DecisionRecord,
	type FindingRecord,
	INQUIRY_SCHEMA_VERSION,
	type InquirySnapshot,
	LEGACY_INQUIRY_SCHEMA_VERSION,
	type QuestionRecord,
} from "./models.js";

interface PersistedDocument extends InquirySnapshot {
	readonly revision: number;
}

const queues = new Map<string, Promise<void>>();

function enqueue<T>(path: string, operation: () => Promise<T>): Promise<T> {
	const previous = queues.get(path) ?? Promise.resolve();
	const next = previous.catch(() => {}).then(operation);
	const settled = next.then(
		() => {},
		() => {},
	);
	queues.set(path, settled);
	void settled.then(() => {
		if (queues.get(path) === settled) queues.delete(path);
	});
	return next;
}

function emptyDocument(projectId: string): PersistedDocument {
	return {
		schemaVersion: INQUIRY_SCHEMA_VERSION,
		projectId,
		revision: 0,
		updatedAt: new Date(0).toISOString(),
		artifacts: [],
		findings: [],
		questions: [],
		attempts: [],
		decisions: [],
		reruns: [],
	};
}

function sortRecords<T extends { readonly id: string }>(records: readonly T[]): T[] {
	return [...records].sort((a, b) => a.id.localeCompare(b.id));
}

function stableDocument(document: PersistedDocument): PersistedDocument {
	return {
		...document,
		artifacts: sortRecords(document.artifacts),
		findings: sortRecords(document.findings),
		questions: sortRecords(document.questions),
		attempts: sortRecords(document.attempts),
		decisions: sortRecords(document.decisions),
		reruns: sortRecords(document.reruns ?? []),
	};
}

function parseDocument(raw: string, projectId: string): PersistedDocument {
	const parsed = JSON.parse(raw) as Partial<PersistedDocument> & { schemaVersion?: number };
	const schemaVersion = parsed.schemaVersion;
	if (
		(schemaVersion !== LEGACY_INQUIRY_SCHEMA_VERSION && schemaVersion !== INQUIRY_SCHEMA_VERSION) ||
		parsed.projectId !== projectId ||
		!Array.isArray(parsed.artifacts) ||
		!Array.isArray(parsed.findings) ||
		!Array.isArray(parsed.questions) ||
		!Array.isArray(parsed.attempts)
	) {
		throw new Error("Invalid inquiry ledger document");
	}
	const revision = parsed.revision;
	if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0)
		throw new Error("Invalid inquiry ledger revision");
	return stableDocument({
		...parsed,
		schemaVersion: INQUIRY_SCHEMA_VERSION,
		artifacts: parsed.artifacts,
		findings: parsed.findings,
		questions: parsed.questions,
		attempts: parsed.attempts,
		decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
		reruns: Array.isArray(parsed.reruns) ? parsed.reruns : [],
	} as PersistedDocument);
}

async function readDocument(path: string, projectId: string): Promise<PersistedDocument> {
	try {
		return parseDocument(await readFile(path, "utf8"), projectId);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
			return emptyDocument(projectId);
		throw error;
	}
}

async function writeDocument(path: string, document: PersistedDocument): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	try {
		await writeFile(temporary, `${JSON.stringify(stableDocument(document), null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
		await rename(temporary, path);
	} catch (error) {
		await rm(temporary, { force: true }).catch(() => {});
		throw error;
	}
}

class FileLedgerCollection<T extends { readonly id: string }> implements LedgerCollection<T> {
	constructor(
		private readonly owner: FileInquiryStorage,
		private readonly key:
			| "artifacts"
			| "findings"
			| "questions"
			| "attempts"
			| "decisions"
			| "reruns",
	) {}

	async get(id: string): Promise<T | undefined> {
		return (await this.list()).find((record) => record.id === id);
	}

	async list(): Promise<readonly T[]> {
		const snapshot = await this.owner.snapshot();
		return sortRecords(snapshot[this.key] as unknown as readonly T[]);
	}

	async put(record: T): Promise<void> {
		await this.owner.update(this.key, record as unknown as PersistedLedgerRecord);
	}
}

/**
 * Small deterministic file adapter used by CLI hosts and tests.  Production
 * hosts may replace it with SQLite while retaining the same InquiryStorage
 * contract. Writes use a same-directory temporary file plus rename and all
 * records are sorted by id before serialization.
 */
export class FileInquiryStorage implements InquiryStorage {
	readonly artifacts: ArtifactLedger;
	readonly findings: FindingLedger;
	readonly questions: QuestionLedger;
	readonly attempts: AttemptLedger;
	readonly decisions: DecisionLedger;
	readonly reruns: ArtifactRerunLedger;

	constructor(
		readonly projectId: string,
		readonly path: string,
	) {
		if (!projectId.trim()) throw new Error("Inquiry projectId cannot be empty");
		if (!path.trim()) throw new Error("Inquiry ledger path cannot be empty");
		this.artifacts = new FileLedgerCollection<ArtifactRecord>(this, "artifacts");
		this.findings = new FileLedgerCollection<FindingRecord>(this, "findings");
		this.questions = new FileLedgerCollection<QuestionRecord>(this, "questions");
		this.attempts = new FileLedgerCollection<AttemptRecord>(this, "attempts");
		this.decisions = new FileLedgerCollection<DecisionRecord>(this, "decisions");
		this.reruns = new FileLedgerCollection<ArtifactRerunRecord>(this, "reruns");
	}

	async snapshot(): Promise<InquirySnapshot> {
		return readDocument(this.path, this.projectId);
	}

	async update(
		key: "artifacts" | "findings" | "questions" | "attempts" | "decisions" | "reruns",
		record: PersistedLedgerRecord,
	): Promise<void> {
		return enqueue(this.path, async () => {
			const current = await readDocument(this.path, this.projectId);
			if (key === "artifacts") {
				const artifact = record as ArtifactRecord;
				const errors = [
					...(artifact.projectId !== this.projectId ? ["artifact belongs to another project"] : []),
					...validateArtifactLineage(artifact, current.artifacts),
				];
				if (errors.length) throw new Error(`Invalid artifact record: ${errors.join("; ")}`);
			} else if (key === "findings") {
				const finding = record as FindingRecord;
				const errors = validateFindingReferences(finding, current);
				if (errors.length) throw new Error(`Invalid finding record: ${errors.join("; ")}`);
			} else if (key === "questions") {
				if (
					!record ||
					((record as QuestionRecord).schemaVersion !== INQUIRY_SCHEMA_VERSION &&
						(record as QuestionRecord).schemaVersion !== LEGACY_INQUIRY_SCHEMA_VERSION) ||
					(record as QuestionRecord).projectId !== this.projectId
				)
					throw new Error("Invalid question record");
			} else if (key === "decisions") {
				const decision = record as DecisionRecord;
				if (
					!decision ||
					decision.schemaVersion !== INQUIRY_SCHEMA_VERSION ||
					decision.projectId !== this.projectId ||
					!decision.summary.trim() ||
					!Array.isArray(decision.basis) ||
					!Array.isArray(decision.affectedArtifactIds)
				)
					throw new Error("Invalid decision record");
			} else if (key === "reruns") {
				const rerun = record as ArtifactRerunRecord;
				if (
					!rerun ||
					(rerun.schemaVersion !== INQUIRY_SCHEMA_VERSION &&
						rerun.schemaVersion !== LEGACY_INQUIRY_SCHEMA_VERSION) ||
					rerun.projectId !== this.projectId ||
					!rerun.sourceArtifactId ||
					!rerun.jobId
				)
					throw new Error("Invalid artifact rerun record");
			} else if (
				!record ||
				((record as AttemptRecord).schemaVersion !== INQUIRY_SCHEMA_VERSION &&
					(record as AttemptRecord).schemaVersion !== LEGACY_INQUIRY_SCHEMA_VERSION) ||
				(record as AttemptRecord).projectId !== this.projectId
			) {
				throw new Error("Invalid attempt record");
			}
			const values = [...(current[key] ?? [])] as Array<typeof record>;
			const index = values.findIndex((item) => item.id === record.id);
			if (index >= 0) values[index] = record;
			else values.push(record);
			const next = stableDocument({
				...current,
				revision: current.revision + 1,
				updatedAt: new Date().toISOString(),
				[key]: values,
			});
			await writeDocument(this.path, next);
		});
	}
}

/** Original Node file adapter, retained as the canonical engine/format comparison. */
export class SqliteInquiryStorage extends CanonicalSqliteInquiryStorage {
	constructor(
		projectId: string,
		readonly path: string,
	) {
		if (!projectId.trim()) throw new Error("Inquiry projectId cannot be empty");
		if (!path.trim()) throw new Error("Inquiry SQLite path cannot be empty");
		mkdirSync(dirname(path), { recursive: true });
		const database = new DatabaseSync(path);
		super(projectId, {
			exec: (sql) => database.exec(sql),
			prepare: (sql) => database.prepare(sql),
			serialize: (operation) => enqueue(path, operation),
			close: () => database.close(),
		});
	}
}

/** In-memory adapter is useful for host composition tests and deterministic previews. */
export class MemoryInquiryStorage implements InquiryStorage {
	private state: InquirySnapshot;
	readonly artifacts: ArtifactLedger;
	readonly findings: FindingLedger;
	readonly questions: QuestionLedger;
	readonly attempts: AttemptLedger;
	readonly decisions: DecisionLedger;
	readonly reruns: ArtifactRerunLedger;

	constructor(
		readonly projectId: string,
		initial?: Partial<InquirySnapshot>,
	) {
		if (!projectId.trim()) throw new Error("Inquiry projectId cannot be empty");
		this.state = {
			schemaVersion: INQUIRY_SCHEMA_VERSION,
			projectId,
			revision: initial?.revision ?? 0,
			updatedAt: initial?.updatedAt ?? new Date(0).toISOString(),
			artifacts: sortRecords(initial?.artifacts ?? []),
			findings: sortRecords(initial?.findings ?? []),
			questions: sortRecords(initial?.questions ?? []),
			attempts: sortRecords(initial?.attempts ?? []),
			decisions: sortRecords(initial?.decisions ?? []),
			reruns: sortRecords(initial?.reruns ?? []),
		};
		this.artifacts = new MemoryLedgerCollection(this, "artifacts");
		this.findings = new MemoryLedgerCollection(this, "findings");
		this.questions = new MemoryLedgerCollection(this, "questions");
		this.attempts = new MemoryLedgerCollection(this, "attempts");
		this.decisions = new MemoryLedgerCollection(this, "decisions");
		this.reruns = new MemoryLedgerCollection(this, "reruns");
	}

	async snapshot(): Promise<InquirySnapshot> {
		return structuredClone(this.state);
	}

	async update(
		key: "artifacts" | "findings" | "questions" | "attempts" | "decisions" | "reruns",
		record: PersistedLedgerRecord,
	): Promise<void> {
		if (key === "artifacts") {
			const artifact = record as ArtifactRecord;
			const errors = [
				...(artifact.projectId !== this.projectId ? ["artifact belongs to another project"] : []),
				...validateArtifactLineage(artifact, this.state.artifacts),
			];
			if (errors.length) throw new Error(`Invalid artifact record: ${errors.join("; ")}`);
		}
		if (key === "findings") {
			const errors = validateFindingReferences(record as FindingRecord, this.state);
			if (errors.length) throw new Error(`Invalid finding record: ${errors.join("; ")}`);
		}
		if (key === "decisions") {
			const decision = record as DecisionRecord;
			if (
				decision.schemaVersion !== INQUIRY_SCHEMA_VERSION ||
				decision.projectId !== this.projectId ||
				!decision.summary.trim() ||
				!Array.isArray(decision.basis) ||
				!Array.isArray(decision.affectedArtifactIds)
			)
				throw new Error("Invalid decision record");
		}
		if (key === "reruns") {
			const rerun = record as ArtifactRerunRecord;
			if (
				(rerun.schemaVersion !== INQUIRY_SCHEMA_VERSION &&
					rerun.schemaVersion !== LEGACY_INQUIRY_SCHEMA_VERSION) ||
				rerun.projectId !== this.projectId ||
				!rerun.sourceArtifactId ||
				!rerun.jobId
			)
				throw new Error("Invalid artifact rerun record");
		}
		const values = [...(this.state[key] ?? [])] as Array<typeof record>;
		const index = values.findIndex((item) => item.id === record.id);
		if (index >= 0) values[index] = record;
		else values.push(record);
		this.state = {
			...this.state,
			revision: this.state.revision + 1,
			updatedAt: new Date().toISOString(),
			[key]: sortRecords(values),
		};
	}
}

class MemoryLedgerCollection<T extends { readonly id: string }> implements LedgerCollection<T> {
	constructor(
		private readonly owner: MemoryInquiryStorage,
		private readonly key:
			| "artifacts"
			| "findings"
			| "questions"
			| "attempts"
			| "decisions"
			| "reruns",
	) {}
	async get(id: string): Promise<T | undefined> {
		return (await this.list()).find((record) => record.id === id);
	}
	async list(): Promise<readonly T[]> {
		const snapshot = await this.owner.snapshot();
		return sortRecords((snapshot[this.key] ?? []) as unknown as readonly T[]);
	}
	async put(record: T): Promise<void> {
		await this.owner.update(this.key, record as unknown as PersistedLedgerRecord);
	}
}
