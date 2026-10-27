import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
	if (!input || typeof input !== "object") throw new Error("Discovery host input is required");
	const value = input as Record<string, unknown>;
	if (typeof value.projectId !== "string" || typeof value.projectRoot !== "string")
		throw new Error("Discovery host input requires projectId and projectRoot");
	return {
		projectId: value.projectId,
		projectRoot: value.projectRoot,
		...(typeof value.agentDir === "string" ? { agentDir: value.agentDir } : {}),
	};
}

function recordRoot(input: DiscoveryHostInput): string {
	return input.agentDir ?? join(input.projectRoot, "runs", ".drone-discovery");
}

async function readRecords(root: string, file: string): Promise<readonly unknown[]> {
	try {
		const parsed: unknown = JSON.parse(await readFile(join(root, file), "utf8"));
		if (!Array.isArray(parsed)) throw new Error(`Discovery record file is not an array: ${file}`);
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
		status: async () => ({ contractVersion: 1, projectId: input.projectId, provider: "pi-discovery", readOnly: true }),
		listCriticReviews: async () => readRecords(root, "critics.json"),
		listMultipathAssessments: async () => readRecords(root, "multipath.json"),
		listExplorationPlans: async () => readRecords(root, "plans.json"),
		listEvaluations: async () => readRecords(root, "evaluations.json"),
	};
}

export const discoveryHostLoader: DiscoveryHostLoader = {
	contractVersion: 1,
	create: (input) => createHost(readInput(input)),
	load: () => createHost({ projectId: "default", projectRoot: process.cwd() }),
};
