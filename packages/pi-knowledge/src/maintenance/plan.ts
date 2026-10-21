export type MaintenanceItemKind = "missing-topic" | "source-changed" | "orphan" | "unlinked";

export interface MaintenanceItem {
	readonly id: string;
	readonly kind: MaintenanceItemKind;
	readonly path: string;
	readonly title?: string;
	readonly detail?: string;
}

export interface MaintenanceSettings {
	readonly enabled: boolean;
	readonly maxItems: number;
	readonly dailyLimit: number;
}

const priority: Record<MaintenanceItemKind, number> = {
	"missing-topic": 0,
	"source-changed": 1,
	orphan: 2,
	unlinked: 3,
};

export function planMaintenance(
	status: { readonly items?: readonly Partial<MaintenanceItem>[] } | null,
	_graph: unknown,
	settings: MaintenanceSettings,
): MaintenanceItem[] {
	if (!settings.enabled || settings.maxItems <= 0) return [];
	return (status?.items || [])
		.filter((item) => typeof item.path === "string" && item.path.length > 0)
		.filter((item) => !/(?:^|\/)(?:Index|Home)\.md$/i.test(String(item.path)))
		.map((item, index) => {
			const kind = ["missing-topic", "source-changed", "orphan", "unlinked"].includes(String(item.kind))
				? (item.kind as MaintenanceItemKind)
				: "orphan";
			return { id: String(item.id || `${kind}:${item.path}:${index}`), kind, path: String(item.path), ...(item.title ? { title: String(item.title) } : {}), ...(item.detail ? { detail: String(item.detail) } : {}) };
		})
		.sort((left, right) => priority[left.kind] - priority[right.kind] || left.path.localeCompare(right.path))
		.slice(0, Math.min(settings.maxItems, settings.dailyLimit));
}
