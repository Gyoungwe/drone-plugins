import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { INQUIRY_SCHEMA_VERSION, type InquirySnapshot, LEGACY_INQUIRY_SCHEMA_VERSION } from "./models.js";

interface PersistedDocument extends InquirySnapshot {
	readonly revision: number;
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

export function sortRecords<T extends { readonly id: string }>(records: readonly T[]): T[] {
	return [...records].sort((a, b) => a.id.localeCompare(b.id));
}

export function stableDocument(document: PersistedDocument): PersistedDocument {
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
	const parsed = JSON.parse(raw) as Partial<PersistedDocument> & {
		schemaVersion?: number;
	};
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

export async function readDocument(path: string, projectId: string): Promise<PersistedDocument> {
	try {
		return parseDocument(await readFile(path, "utf8"), projectId);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
			return emptyDocument(projectId);
		throw error;
	}
}

export async function writeDocument(path: string, document: PersistedDocument): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	try {
		await writeFile(temporary, `${JSON.stringify(stableDocument(document), null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
		await rename(temporary, path);
	} catch (error) {
		const [cleanup] = await Promise.allSettled([rm(temporary, { force: true })]);
		if (cleanup.status === "rejected")
			throw new AggregateError([error, cleanup.reason], "Inquiry file write and cleanup failed");
		throw error;
	}
}
