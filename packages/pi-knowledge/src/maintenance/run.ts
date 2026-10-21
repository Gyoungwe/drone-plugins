import { maintenancePrompt, parseMaintenanceJson } from "./prompts.js";
import type { MaintenanceItem } from "./plan.js";

export interface MaintenanceRunResult {
	readonly startedAt: string;
	readonly processed: number;
	readonly modelCalls: number;
	readonly items: readonly { id: string; kind: string; status: string; reason?: string }[];
}

export interface MaintenancePorts {
	readonly readNote: (path: string) => Promise<{
		title?: string;
		markdown: string;
		sourceMarkdown?: string;
		exists?: boolean;
	}>;
	readonly complete: (prompt: string, model?: string | null) => Promise<string>;
	readonly model?: string | null;
	readonly setTopic: (path: string, topic: string) => Promise<void>;
	readonly proposeWiki: (item: MaintenanceItem, proposal: Record<string, unknown>) => Promise<void>;
	readonly validateWikiLinks?: (proposal: Record<string, unknown>) => Promise<void>;
	readonly budget?: { readonly modelCalls: number };
	readonly signal?: AbortSignal;
}

export async function runMaintenance(items: readonly MaintenanceItem[], ports: MaintenancePorts): Promise<MaintenanceRunResult> {
	const results: Array<MaintenanceRunResult["items"][number]> = [];
	let modelCalls = 0;
	for (const item of items) {
		if (ports.signal?.aborted) throw ports.signal.reason ?? new Error("maintenance aborted");
		if (!(["missing-topic", "source-changed", "orphan", "unlinked"] as string[]).includes(item.kind))
			throw new Error(`unknown-maintenance-kind:${item.kind}`);
		if (ports.budget && modelCalls >= ports.budget.modelCalls) {
			results.push({ id: item.id, kind: item.kind, status: "skipped", reason: "daily-budget-exhausted" });
			continue;
		}
		try {
			const note = await ports.readNote(item.path);
			if (note.exists === false) {
				results.push({ id: item.id, kind: item.kind, status: "skipped", reason: "missing-note" });
				continue;
			}
			modelCalls++;
			const output = parseMaintenanceJson(
				await ports.complete(
					maintenancePrompt(item.kind, {
						...item,
						title: note.title || item.title,
						markdown: note.markdown,
						sourceMarkdown: note.sourceMarkdown,
					}),
					ports.model,
				),
			);
			if (item.kind === "missing-topic") {
				const topic = String(output.topic || "").trim();
				if (!topic || topic.length > 40) throw new Error("invalid-topic");
				await ports.setTopic(item.path, topic);
				results.push({ id: item.id, kind: item.kind, status: "topic-updated" });
			} else if (item.kind === "source-changed" || item.kind === "orphan" || item.kind === "unlinked") {
				const targets = Array.isArray(output.targets)
					? output.targets.map((target) => String(target).trim()).filter(Boolean)
					: [String(output.target || "").trim()].filter(Boolean);
				if (!targets.length) throw new Error("invalid-wiki-target");
				const markdown = targets.map((target) => (target.startsWith("[[") ? target : `[[${target}]]`)).join(" ");
				const proposal = {
					title: String(output.title || item.title || item.path),
					markdown,
					rationale: String(output.reason || output.rationale || item.detail || "Automatic maintenance candidate"),
					targets,
				};
				await ports.validateWikiLinks?.(proposal);
				await ports.proposeWiki(item, proposal);
				results.push({ id: item.id, kind: item.kind, status: "candidate-submitted" });
			} else {
				throw new Error(`unknown-maintenance-kind:${item.kind}`);
			}
		} catch (error) {
			results.push({ id: item.id, kind: item.kind, status: "skipped", reason: error instanceof Error ? error.message : String(error) });
		}
	}
	return { startedAt: new Date().toISOString(), processed: results.length, modelCalls, items: results };
}
