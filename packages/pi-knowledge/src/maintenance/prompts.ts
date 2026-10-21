export type MaintenancePromptKind = "missing-topic" | "source-changed" | "orphan" | "unlinked";

export function maintenancePrompt(kind: MaintenancePromptKind, item: { path: string; title?: string; detail?: string }): string {
	const context = `Path: ${item.path}\nTitle: ${item.title || ""}\nDetail: ${item.detail || ""}`;
	if (kind === "missing-topic")
		return `${context}\nReturn JSON only: {"topic":"..."}. Choose a concise topic of at most 40 characters. Preserve the note body and human title.`;
	return `${context}\nReturn JSON only: {"title":"...","markdown":"...","rationale":"..."}. Suggest a bounded Wiki review candidate. Never claim a write occurred.`;
}

export function parseMaintenanceJson(text: string): Record<string, unknown> {
	const value: unknown = JSON.parse(text);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("maintenance model output must be a JSON object");
	return value as Record<string, unknown>;
}
