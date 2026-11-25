import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, parse, relative, resolve } from "node:path";
import type { TaskPlanMilestone } from "@gyoungwe/plugin-api/tasks";

interface TaskContract {
	id: string;
	goal: string;
	binding?: string | null;
	authorizationSummary?: string | null;
	writeRoots?: readonly string[] | null;
	compute?: unknown;
	milestones: readonly Pick<TaskPlanMilestone, "id" | "title" | "dependsOn" | "acceptance">[];
}

export interface ConsentTask extends TaskContract {
	planApproved?: boolean;
	executionConsent?: {
		version: number;
		contractHash: string;
		maxCalls: number;
		maxAutoResumes: number;
		approvedAt: string;
	} | null;
}

const MAX_AUTO_RESUMES = 19;
function contractHash(task: TaskContract) {
	const contract: unknown[] = [
		task.id,
		task.goal,
		task.binding ?? null,
		task.authorizationSummary ?? "",
		task.writeRoots ?? [],
	];
	if (task.compute !== void 0) contract.push(task.compute ?? null);
	contract.push(
		task.milestones.map(({ id, title, dependsOn, acceptance }) => ({ id, title, dependsOn, acceptance })),
	);
	return createHash("sha256").update(JSON.stringify(contract)).digest("hex");
}
function hasTaskConsent(task: ConsentTask | null | undefined, maxCalls: number) {
	const c = task?.executionConsent;
	return !!(
		task?.planApproved &&
		task.milestones.length &&
		c?.version === 1 &&
		c.contractHash === contractHash(task) &&
		c.maxCalls === maxCalls &&
		c.maxAutoResumes === MAX_AUTO_RESUMES &&
		typeof c.approvedAt === "string"
	);
}
async function resolveWriteRoots(cwd: string, paths: unknown = []) {
	if (!Array.isArray(paths) || paths.length > 8) throw new Error("Choose at most eight project directories.");
	const roots: string[] = [];
	const home = await realpath(homedir());
	for (const p of paths) {
		if (typeof p !== "string" || !p.trim() || p.length > 512) throw new Error("Invalid write directory.");
		const root = await realpath(resolve(cwd, p));
		const homeRelative = relative(root, home);
		if (root === parse(root).root || (!isAbsolute(homeRelative) && !homeRelative.startsWith("..")))
			throw new Error("Authorize a project directory, not a drive, home directory or its parent.");
		if (!(await stat(root)).isDirectory())
			throw new Error("Authorize an existing project directory; outputs may create subdirectories.");
		if (!roots.includes(root)) roots.push(root);
	}
	return roots;
}

export { contractHash, hasTaskConsent, MAX_AUTO_RESUMES, resolveWriteRoots };
