import { maintenancePrompt, parseMaintenanceJson } from "./prompts.js";
import type { MaintenanceItem } from "./plan.js";

export interface MaintenanceRunResult {
	readonly startedAt: string;
	readonly processed: number;
	readonly modelCalls: number;
	readonly items: readonly { id: string; kind: string; status: string; reason?: string }[];
}

export interface MaintenancePorts {
	readonly readNote: (path: string) => Promise<{ title?: string; markdown: string; exists?: boolean }>;
	readonly complete: (prompt: string) => Promise<string>;
	readonly setTopic: (path: string, topic: string) => Promise<void>;
	readonly proposeWiki: (item: MaintenanceItem, proposal: Record<string, unknown>) => Promise<void>;
}

export async function runMaintenance(items: readonly MaintenanceItem[], ports: MaintenancePorts): Promise<MaintenanceRunResult> {
	const results: Array<MaintenanceRunResult["items"][number]> = [];
	let modelCalls = 0;
	for (const item of items) {
		try {
			const note = await ports.readNote(item.path);
			if (note.exists === false) {
				results.push({ id: item.id, kind: item.kind, status: "skipped", reason: "missing-note" });
				continue;
			}
			modelCalls++;
			const output = parseMaintenanceJson(await ports.complete(maintenancePrompt(item.kind, { ...item, title: note.title || item.title })));
			if (item.kind === "missing-topic") {
				const topic = String(output.topic || "").trim();
				if (!topic || topic.length > 40) throw new Error("invalid-topic");
				await ports.setTopic(item.path, topic);
				results.push({ id: item.id, kind: item.kind, status: "topic-updated" });
			} else {
				await ports.proposeWiki(item, output);
				results.push({ id: item.id, kind: item.kind, status: "candidate-submitted" });
			}
		} catch (error) {
			results.push({ id: item.id, kind: item.kind, status: "skipped", reason: error instanceof Error ? error.message : String(error) });
		}
	}
	return { startedAt: new Date().toISOString(), processed: results.length, modelCalls, items: results };
}
