import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";

export const JOURNALS = [
	"sessions",
	"critics",
	"multipath",
	"plans",
	"evaluations",
	"baselines",
] as const;
export type JournalName = (typeof JOURNALS)[number];
const MAX_JOURNAL_BYTES = 1_048_576;
const MAX_RESULTS = 32;

/** Native reads are confined to the calling session's workspace; never infer a Desktop/HOME root. */
async function readJournal(
	cwd: string,
	journal: JournalName,
): Promise<readonly Record<string, unknown>[] | null> {
	if (!JOURNALS.includes(journal)) throw new Error("Unknown discovery journal");
	let path = await realpath(cwd);
	try {
		for (const part of ["runs", ".drone-discovery", `${journal}.json`]) {
			path = join(path, part);
			if ((await lstat(path)).isSymbolicLink())
				throw new Error("Discovery journal path contains a symlink");
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const metadata = await file.stat();
		if (!metadata.isFile() || metadata.size > MAX_JOURNAL_BYTES)
			throw new Error(
				`Discovery journal must be a file of at most ${MAX_JOURNAL_BYTES} bytes`,
			);
		const bytes = Buffer.alloc(MAX_JOURNAL_BYTES + 1);
		const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
		if (bytesRead > MAX_JOURNAL_BYTES)
			throw new Error("Discovery journal exceeds the byte limit");
		const value: unknown = JSON.parse(
			bytes.subarray(0, bytesRead).toString("utf8"),
		);
		if (
			!Array.isArray(value) ||
			value.some(
				(item) => !item || typeof item !== "object" || Array.isArray(item),
			)
		)
			throw new Error(
				`Discovery journal ${journal} must contain an array of records`,
			);
		return value as Record<string, unknown>[];
	} finally {
		await file.close();
	}
}

export async function nativeDiscoveryStatus(cwd: string) {
	const journals = await Promise.all(
		JOURNALS.map(async (journal) => {
			const records = await readJournal(cwd, journal);
			return {
				journal,
				configured: records !== null,
				count: records?.length ?? 0,
			};
		}),
	);
	return {
		status: journals.some((item) => item.configured)
			? "configured"
			: "unconfigured",
		readOnly: true,
		journalRoot: "runs/.drone-discovery",
		journals,
		execution: "unavailable",
		inquiry: "unavailable",
	};
}

export async function nativeDiscoveryRecords(
	cwd: string,
	journal: JournalName,
	query?: string,
) {
	const records = await readJournal(cwd, journal);
	const needle = query?.trim().toLocaleLowerCase();
	const matches = records?.filter(
		(record) =>
			!needle || JSON.stringify(record).toLocaleLowerCase().includes(needle),
	);
	return {
		status: records === null ? "unconfigured" : "configured",
		journal,
		readOnly: true,
		records: matches?.slice(0, MAX_RESULTS) ?? [],
		count: matches?.length ?? 0,
		truncated: (matches?.length ?? 0) > MAX_RESULTS,
	};
}
