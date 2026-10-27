import type { WorkbenchTask } from "@gyoungwe/plugin-api/ui";

/** Render only recorded local paths; opening remains a host-authorized operation. */
function localHref(path: string): string | undefined {
	const normalized = path.replaceAll("\\", "/");
	if (
		!normalized ||
		[...normalized].some(character => character.charCodeAt(0) < 32) ||
		/^(?:file:|\/\/)/i.test(normalized) ||
		(/^[a-z][a-z0-9+.-]*:/i.test(normalized) && !/^[a-z]:\//i.test(normalized))
	)
		return;
	const encoded = normalized
		.split("/")
		.map((part) =>
			encodeURIComponent(part).replace(
				/[!'()*]/g,
				(c) => `%${c.charCodeAt(0).toString(16)}`,
			),
		)
		.join("/");
	if (/^[a-z]:\//i.test(normalized))
		return `file:///${normalized.slice(0, 2)}${encoded.slice(4)}`;
	return normalized.startsWith("/") ? `file://${encoded}` : `./${encoded}`;
}
export function taskArtifactLinks(task: WorkbenchTask) {
	const byPath = new Map<
		string,
		{ path: string; href: string; state: string }
	>();
	const add = (path: string | undefined, state: string) => {
		if (!path) return;
		const href = localHref(path);
		if (!href) return;
		const normalized = path.replaceAll("\\", "/");
		byPath.set(
			/^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized,
			{ path, href, state },
		);
	};
	for (const milestone of task.milestones)
		if (
			milestone.state === "completed" &&
			milestone.evidence?.kind === "file-observed"
		)
			add(milestone.evidence.path, "observed");
	for (const operation of task.operations)
		if (
			operation.artifact &&
			!(operation.artifact as { intentOnly?: boolean }).intentOnly &&
			!["started", "failed"].includes(operation.state)
		)
			add(operation.artifact.path, operation.state);
	return [...byPath.values()];
}
