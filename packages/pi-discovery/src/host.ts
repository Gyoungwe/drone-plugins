import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export interface DiscoveryHostInput {
	readonly projectId: string;
	readonly projectRoot: string;
	readonly agentDir?: string;
}

export interface DiscoveryHostPort {
	readonly contractVersion: 1;
	status(input?: unknown): Promise<unknown>;
	listCriticReviews(input?: unknown): Promise<readonly unknown[]>;
	listMultipathAssessments(input?: unknown): Promise<readonly unknown[]>;
	listExplorationPlans(input?: unknown): Promise<readonly unknown[]>;
	listEvaluations(input?: unknown): Promise<readonly unknown[]>;
}

export interface DiscoveryHostLoader {
	readonly contractVersion: 1;
	readonly create: (input: unknown) => DiscoveryHostPort;
	readonly load: () => DiscoveryHostPort;
}

function readInput(input: unknown): DiscoveryHostInput {
	if (!input || typeof input !== "object")
		throw new Error("Discovery host input is required");
	const value = input as Record<string, unknown>;
	if (
		typeof value.projectId !== "string" ||
		typeof value.projectRoot !== "string"
	)
		throw new Error("Discovery host input requires projectId and projectRoot");
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.projectId))
		throw new Error("Invalid discovery project id");
	if (!isAbsolute(value.projectRoot))
		throw new Error("Discovery projectRoot must be absolute");
	return {
		projectId: value.projectId,
		projectRoot: resolve(value.projectRoot),
		...(typeof value.agentDir === "string" ? { agentDir: value.agentDir } : {}),
	};
}

function recordRoot(input: DiscoveryHostInput): string {
	return resolve(
		input.agentDir ?? join(input.projectRoot, "runs", ".drone-discovery"),
	);
}

async function readRecords(
	root: string,
	file: string,
): Promise<readonly unknown[]> {
	try {
		const parsed: unknown = JSON.parse(
			await readFile(join(root, file), "utf8"),
		);
		if (!Array.isArray(parsed))
			throw new Error(`Discovery record file is not an array: ${file}`);
		return parsed;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

function createHost(input: DiscoveryHostInput): DiscoveryHostPort {
	const root = recordRoot(input);
	return {
		contractVersion: 1,
		status: async () => ({
			contractVersion: 1,
			projectId: input.projectId,
			provider: "pi-discovery",
			readOnly: true,
		}),
		listCriticReviews: async () =>
			withoutRecordedAt(await readRecords(root, "critics.json")),
		listMultipathAssessments: async () =>
			withoutRecordedAt(await readRecords(root, "multipath.json")),
		listExplorationPlans: async () => readRecords(root, "plans.json"),
		listEvaluations: async () => readRecords(root, "evaluations.json"),
	};
}

/** Persistence timestamps are private to the journal, as in DiscoveryService's public projection. */
function withoutRecordedAt(records: readonly unknown[]): readonly unknown[] {
	return records.map((record) => {
		if (!record || typeof record !== "object" || Array.isArray(record))
			throw new Error("Discovery journal record must be an object");
		const { recordedAt: _recordedAt, ...projection } = record as Record<
			string,
			unknown
		>;
		return projection;
	});
}

export const discoveryHostLoader: DiscoveryHostLoader = {
	contractVersion: 1,
	create: (input) => createHost(readInput(input)),
	load: () => createHost({ projectId: "default", projectRoot: process.cwd() }),
};
