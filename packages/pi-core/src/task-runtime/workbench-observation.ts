import { isAbsolute, resolve } from "node:path";
import { failureObservation, toolResultFailed } from "./failure-feedback.js";
import { controls, hash, stable } from "./workbench-guard.js";
import {
	clean,
	depsDone,
	type InspectFile,
	type TaskOperation,
	type TaskRecord,
	type TaskToolResult,
	terminal,
} from "./workbench-state.js";
import { bindIdentity, type workbenchVerifiers } from "./workbench-verifiers.js";

type AllVerifiers = ReturnType<typeof workbenchVerifiers>["allVerifiers"];

function sameArtifactPath(cwd: string, declared: unknown, observed: string, absolute: string) {
	const normalize = (path: string) => {
		const full = resolve(cwd || process.cwd(), path);
		return process.platform === "win32" ? full.toLowerCase() : full;
	};
	if (typeof declared !== "string") return false;
	const candidate = isAbsolute(declared) && typeof absolute === "string" ? absolute : observed;
	return typeof candidate === "string" && normalize(declared) === normalize(candidate);
}

async function observeFile(
	task: TaskRecord,
	operation: TaskOperation,
	cwd: string,
	path: string,
	inspect: InspectFile,
	now: () => string,
) {
	try {
		const artifact = await inspect(cwd, path);
		operation.artifact = artifact;
		operation.state = "verified";
		operation.verifier = "workspace-file-readback-not-scientific-review";
		for (const milestone of task.milestones) {
			const expected = milestone.acceptance;
			if (
				expected.kind === "file" &&
				(!expected.rootKind || expected.rootKind === artifact.rootKind) &&
				sameArtifactPath(cwd, expected.path, artifact.path, artifact.absolutePath) &&
				(!expected.sha256 || expected.sha256 === artifact.sha256) &&
				depsDone(task, milestone)
			) {
				milestone.state = "completed";
				milestone.evidence = { ...artifact, kind: "file-observed", at: now() };
			}
		}
	} catch {
		return;
	}
}

function observeVerifiers(
	task: TaskRecord,
	operation: TaskOperation,
	event: TaskToolResult,
	allVerifiers: AllVerifiers,
	now: () => string,
) {
	const details = event.details || {};
	for (const verifier of allVerifiers()) {
		if (!verifier.observe) continue;
		let review: { id?: unknown; path?: unknown } | null;
		try {
			review = verifier.observe(event, details) as typeof review;
		} catch {
			continue;
		}
		if (!review?.id) continue;
		operation.state = "awaiting-review";
		operation.candidateId = clean(review.id);
		operation.review = { kind: verifier.kind, id: clean(review.id), path: clean(review.path, 512) || null };
		break;
	}
	for (const verifier of allVerifiers()) {
		if (!verifier.identify) continue;
		let identity: unknown;
		try {
			identity = verifier.identify(event, details);
		} catch {
			continue;
		}
		bindIdentity(task, verifier, identity, operation, now);
	}
}

function observeProgress(task: TaskRecord, event: TaskToolResult, failed: boolean, now: () => string) {
	const id = clean(event.toolCallId, 100);
	const observed = task.pendingObservations?.includes(id);
	task.pendingObservations = (task.pendingObservations || []).filter((pending) => pending !== id);
	if (observed && !failed && !controls.has(event.toolName) && event.toolName !== "ask_user") {
		const key = hash(`${event.toolName}\0${stable(event.input || {})}`);
		task.progressKeys ||= [];
		if (!task.progressKeys.includes(key)) {
			task.progressKeys.push(key);
			task.progressKeys = task.progressKeys.slice(-64);
			task.progressCount = (task.progressCount || 0) + 1;
		}
	}
	const operation = task.operations.find((candidate) => candidate.id === event.toolCallId);
	if (!failed || (!observed && operation?.state !== "started")) return operation;
	const failure = failureObservation(event, now());
	task.failures = [...(task.failures || []).filter((item) => item.id !== failure.id), failure].slice(-4);
	if (!operation && !terminal(task.state) && !["blocked", "waiting_user"].includes(task.state)) {
		task.state = "partial";
		task.reason = "tool-failure";
	}
	return operation;
}

export async function observeTask(
	task: TaskRecord,
	event: TaskToolResult,
	cwd: string,
	inspect: InspectFile,
	allVerifiers: AllVerifiers,
	now: () => string,
	save: () => void,
) {
	if (event.toolName === "capability_load") {
		const loaded = (event.input?.capabilities || []) as string[];
		task.capabilities = [...new Set([...task.capabilities, ...loaded])]
			.filter((capability) => typeof capability === "string")
			.slice(0, 16);
		save();
		return;
	}
	const failed = toolResultFailed(event);
	const operation = observeProgress(task, event, failed, now);
	if (!operation) return save();
	const text = (event.content || [])
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join(" ");
	const cancelled =
		event.toolName === "ask_user" && (event.details?.cancelled || /cancelled|canceled/i.test(text));
	operation.state = failed ? "failed" : cancelled ? "cancelled" : "returned";
	operation.at = now();
	if (!failed && ["write", "edit"].includes(event.toolName) && typeof event.input?.path === "string")
		await observeFile(task, operation, cwd, event.input.path, inspect, now);
	if (!failed) observeVerifiers(task, operation, event, allVerifiers, now);
	const { id, tool, state, at, artifact } = operation;
	task.receipts.push({ id, tool, state, at, ...(artifact ? { artifact } : {}) });
	task.receipts = task.receipts.slice(-24);
	if (cancelled) {
		task.state = "waiting_user";
		task.reason = "user-cancelled-choice-not-consent";
	} else if (failed) {
		task.state = "partial";
		task.reason = "tool-failure";
	} else if (event.toolName === "ask_user") {
		if (task.waitStartedAt) {
			task.waitMs += Math.max(0, Date.parse(now()) - Date.parse(task.waitStartedAt));
			task.waitStartedAt = null;
		}
		task.state = "running";
	}
	save();
}
