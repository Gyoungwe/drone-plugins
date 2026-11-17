import { spawn } from "node:child_process";
import { TextEncoder } from "node:util";
import type {
	ControlledKernelRunner,
	KernelLanguage,
	KernelPreparation,
	KernelRunnerCapabilities,
	KernelRunOutput,
	KernelRunRequest,
	KernelRunResult,
} from "./kernel-types.js";

const encoder = new TextEncoder();

/** Explicit capability gate used before creating an interactive session. */
export function prepareKernel(runner: ControlledKernelRunner, language: KernelLanguage): KernelPreparation {
	if (!runner?.capabilities?.languages.includes(language))
		return { status: "needs-container", reason: "language is unavailable" };
	if (runner.capabilities.kind !== "container")
		return {
			status: "needs-container",
			reason: "a container runtime is required for production kernel execution",
		};
	if (!runner.capabilities.networkDisabled || !runner.capabilities.writesOnlyToRunDirectory)
		return {
			status: "needs-container",
			reason: "runner sandbox guarantees are incomplete",
		};
	return { status: "ready", capabilities: runner.capabilities };
}

/**
 * Test-only runner. It uses an argv-only child process and never accepts a shell
 * command. It is deliberately marked `fixture`, so production preparation still
 * reports `needs-container`.
 */
export class SubprocessFixtureRunner implements ControlledKernelRunner {
	readonly capabilities: KernelRunnerCapabilities = {
		kind: "fixture",
		languages: ["python", "r"],
		networkDisabled: true,
		writesOnlyToRunDirectory: true,
	};

	constructor(
		private readonly commands: Partial<Record<KernelLanguage, string>> = {
			python: "python3",
		},
	) {}

	run(request: KernelRunRequest): Promise<KernelRunResult> {
		const command = this.commands[request.language];
		if (
			!command ||
			(request.language === "python" && command !== "python3") ||
			(request.language === "r" && command !== "Rscript")
		)
			return Promise.reject(new Error("fixture-command-not-allowlisted"));
		const args =
			request.language === "python" ? ["-I", "-c", request.code] : ["--vanilla", "-e", request.code];
		const started = Date.now();
		return new Promise((resolve, reject) => {
			const child = spawn(command, args, {
				cwd: request.runDirectory,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let stdout = "";
			let stderr = "";
			const append = (value: Buffer, target: "stdout" | "stderr") => {
				const text = value.toString("utf8");
				if (target === "stdout") stdout = `${stdout}${text}`.slice(0, request.maxOutputBytes);
				else stderr = `${stderr}${text}`.slice(0, request.maxOutputBytes);
			};
			child.stdout.on("data", (value: Buffer) => append(value, "stdout"));
			child.stderr.on("data", (value: Buffer) => append(value, "stderr"));
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new Error("fixture-timeout"));
			}, request.timeoutMs);
			child.once("error", (error) => {
				clearTimeout(timer);
				reject(error);
			});
			child.once("close", (exitCode) => {
				clearTimeout(timer);
				const outputs: KernelRunOutput[] = [];
				if (stdout) {
					const contentKind = stdout
						.split(/\r?\n/)
						.every((line) => line.length === 0 || line.startsWith("[summary]"))
						? "summary"
						: stdout.split(/\r?\n/).every((line) => line.length === 0 || line.startsWith("[plot]"))
							? "plot"
							: "raw";
					outputs.push({
						text: stdout,
						contentKind,
						classification: request.dataClassification,
					});
				}
				if (stderr)
					outputs.push({
						text: stderr,
						contentKind: "raw",
						classification: request.dataClassification,
					});
				resolve({
					exitCode: exitCode ?? 1,
					outputs,
					durationMs: Date.now() - started,
					producedBytes: encoder.encode(`${stdout}${stderr}`).byteLength,
				});
			});
		});
	}
}

/** Capability record used when Docker/Podman is absent; it never pretends to execute. */
export class UnavailableKernelRunner implements ControlledKernelRunner {
	readonly capabilities: KernelRunnerCapabilities = {
		kind: "unavailable",
		languages: ["python", "r"],
		networkDisabled: false,
		writesOnlyToRunDirectory: false,
	};

	run(_request: KernelRunRequest): Promise<KernelRunResult> {
		return Promise.reject(new Error("needs-container"));
	}
}
