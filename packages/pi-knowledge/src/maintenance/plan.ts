import { looksLikeFileName } from "../core/note-title.js";

export type MaintenanceItemKind = "missing-topic" | "source-changed" | "orphan" | "unlinked";

export interface MaintenanceItem {
	readonly id: string;
	readonly kind: MaintenanceItemKind;
	readonly path: string;
	readonly title?: string;
	readonly detail?: string;
}

export interface MaintenanceGraphNode {
	readonly path: string;
	readonly title?: string;
	readonly kind?: string;
	readonly degree?: number;
	readonly warnings?: readonly string[];
	readonly isInfrastructure?: boolean;
	readonly nodeType?: string;
}

export interface MaintenanceGraph {
	readonly nodes?: readonly MaintenanceGraphNode[];
	readonly edges?: readonly { source: string; target: string; type?: string }[];
	readonly semantic?: { nodes?: readonly MaintenanceGraphNode[]; edges?: readonly { source: string; target: string; type?: string }[] };
}

export interface MaintenanceSettings {
	readonly enabled: boolean;
	readonly maxItems: number;
	readonly dailyLimit: number;
	readonly model?: string | null;
}

const priority: Record<MaintenanceItemKind, number> = {
	"missing-topic": 0,
	"source-changed": 1,
	orphan: 2,
	unlinked: 3,
};

export function planMaintenance(
	_status: unknown,
	graph: MaintenanceGraph | null,
	settings: MaintenanceSettings,
): MaintenanceItem[] {
	if (!settings.enabled || settings.maxItems <= 0) return [];
	const nodes = graph?.nodes ?? graph?.semantic?.nodes ?? [];
	const edges = graph?.edges ?? graph?.semantic?.edges ?? [];
	const visible = nodes.filter(
		(node) =>
			node.path &&
			node.kind !== "navigation" &&
			node.nodeType !== "infrastructure" &&
			node.isInfrastructure !== true &&
			!/(?:^|\/)(?:Index|Home)\.md$/i.test(node.path),
	);
	const outgoing = new Map<string, number>();
	const incoming = new Map<string, number>();
	for (const edge of edges) {
		if (edge.type === "directory" || edge.source === edge.target) continue;
		outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
		incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
	}
	const itemsByPath = new Map<string, MaintenanceItem>();
	const add = (item: MaintenanceItem) => {
		const previous = itemsByPath.get(item.path);
		if (!previous || priority[item.kind] < priority[previous.kind]) itemsByPath.set(item.path, item);
	};
	for (const node of visible) {
		const path = node.path;
		const title = String(node.title || "");
		const warnings = node.warnings ?? [];
		const base = { id: path, path, ...(title ? { title } : {}) };
		if (looksLikeFileName(title)) add({ ...base, kind: "missing-topic", detail: "title-is-file-name" });
		if (warnings.some((warning) => /content_sha256.*changed|source.*hash.*changed|hash.*changed/i.test(warning)))
			add({ ...base, kind: "source-changed", detail: warnings.join("; ") });
		const degree = node.degree ?? (outgoing.get(path) ?? 0) + (incoming.get(path) ?? 0);
		if (degree === 0 && node.kind !== "wiki") add({ ...base, kind: "orphan", detail: "no-links" });
		else if (node.kind === "wiki" && (incoming.get(path) ?? 0) === 0)
			add({ ...base, kind: "unlinked", detail: "no-incoming-links" });
	}
	return [...itemsByPath.values()]
		.sort((left, right) => priority[left.kind] - priority[right.kind] || left.path.localeCompare(right.path))
		.slice(0, Math.min(settings.maxItems, settings.dailyLimit));
}
