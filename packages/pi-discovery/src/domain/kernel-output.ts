import { TextDecoder, TextEncoder } from "node:util";
import type {
	DataClassification,
	KernelContentKind,
	KernelExecution,
	KernelLanguage,
	KernelRunOutput,
} from "./kernel-types.js";
import { assertValid, boundedInteger, nonEmptyText } from "./validation.js";

export const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;
const encoder = new TextEncoder();

export function validClassification(value: unknown): value is DataClassification {
	return value === "public" || value === "internal" || value === "controlled" || value === "restricted";
}

function validKind(value: unknown): value is KernelContentKind {
	return value === "summary" || value === "plot" || value === "table" || value === "raw";
}

/**
 * Filter output before it can reach a model or a UI. Controlled projects expose
 * summaries and plots only; restricted projects expose summaries only.
 */
export function filterKernelOutput(
	outputs: readonly KernelRunOutput[],
	policy: DataClassification,
	maxBytes = DEFAULT_MAX_OUTPUT_BYTES,
): {
	readonly text: string;
	readonly redactedBytes: number;
	readonly blocked: boolean;
	readonly kinds: readonly KernelContentKind[];
} {
	assertValid(validClassification(policy), "invalid output policy");
	assertValid(boundedInteger(maxBytes, 1, DEFAULT_MAX_OUTPUT_BYTES * 100), "maxBytes is invalid");
	const accepted: string[] = [];
	const kinds: KernelContentKind[] = [];
	let redactedBytes = 0;
	let blocked = false;
	const classificationRank: Record<DataClassification, number> = {
		public: 0,
		internal: 1,
		controlled: 2,
		restricted: 3,
	};
	for (const item of outputs) {
		if (
			!validKind(item.contentKind) ||
			!validClassification(item.classification) ||
			!nonEmptyText(item.text, maxBytes)
		) {
			blocked = true;
			continue;
		}
		const withinClassification = classificationRank[item.classification] <= classificationRank[policy];
		const allowed =
			withinClassification &&
			(policy === "public" || policy === "internal"
				? item.contentKind !== "raw" || item.classification === "public"
				: policy === "controlled"
					? item.contentKind === "summary" || item.contentKind === "plot"
					: item.contentKind === "summary" && item.classification === "public");
		if (!allowed) {
			redactedBytes += encoder.encode(item.text).byteLength;
			blocked = true;
			continue;
		}
		accepted.push(item.text);
		kinds.push(item.contentKind);
	}
	const text = accepted.join("\n");
	if (encoder.encode(text).byteLength > maxBytes) {
		const bytes = encoder.encode(text).slice(0, maxBytes);
		redactedBytes += encoder.encode(text).byteLength - bytes.byteLength;
		return {
			text: new TextDecoder().decode(bytes),
			redactedBytes,
			blocked: true,
			kinds,
		};
	}
	return { text, redactedBytes, blocked, kinds };
}

export function notebookFor(history: readonly KernelExecution[], language: KernelLanguage): string {
	return JSON.stringify(
		{
			cells: history.map((execution) => ({
				cell_type: "code",
				execution_count: null,
				metadata: {
					drone: { executionId: execution.id, status: execution.status },
				},
				outputs: execution.output
					? [
							{
								name: "stdout",
								output_type: "stream",
								text: `${execution.output}\n`,
							},
						]
					: [],
				source: execution.code.split("\n").map((line) => `${line}\n`),
			})),
			metadata: {
				kernelspec: { language, name: language, display_name: language },
				drone: { schemaVersion: 1 },
			},
			nbformat: 4,
			nbformat_minor: 5,
		},
		null,
		2,
	);
}
