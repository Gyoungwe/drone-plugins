export type MaintenancePromptKind = "missing-topic" | "source-changed" | "orphan" | "unlinked";

export function maintenancePrompt(
	kind: MaintenancePromptKind,
	item: { path: string; title?: string; detail?: string; markdown?: string; sourceMarkdown?: string },
): string {
	const context = [
		`Path: ${item.path}`,
		`Title: ${item.title || ""}`,
		`Detail: ${item.detail || ""}`,
		`Note body (first 4000 characters):\n${String(item.markdown || "").slice(0, 4000)}`,
		...(kind === "source-changed"
			? [`Current source body (first 4000 characters):\n${String(item.sourceMarkdown || item.markdown || "").slice(0, 4000)}`]
			: []),
	].join("\n");
	if (kind === "missing-topic")
		return `${context}\nReturn JSON only: {"topic":"..."}. Choose a concise topic of at most 40 characters. Preserve the note body and human title.`;
	return `${context}\nReturn JSON only: {"target":"Existing note path or Wiki page title","reason":"Why this link would help"}. Suggest one or more existing Wiki targets as [[Target]] links, never a new page or full-page markdown. Never claim a write occurred.`;
}

export function parseMaintenanceJson(text: string): Record<string, unknown> {
	const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
	const value: unknown = JSON.parse(normalized);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("maintenance model output must be a JSON object");
	return value as Record<string, unknown>;
}
