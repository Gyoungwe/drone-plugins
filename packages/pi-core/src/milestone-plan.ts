/** Scientific/operational acceptance vocabulary comes from the installed extensions. */
export interface MilestoneAcceptanceCatalog {
	readonly kinds: readonly string[];
	readonly fields: Readonly<Record<string, readonly string[]>>;
}

export interface TaskMilestoneInput {
	readonly id: string;
	readonly title: string;
	readonly dependsOn?: readonly string[];
	readonly acceptance: Readonly<Record<string, unknown>> & {
		readonly kind: string;
	};
}

export interface TaskPlanMilestone {
	readonly id: string;
	readonly title: string;
	readonly dependsOn: readonly string[];
	readonly acceptance: Readonly<Record<string, unknown>>;
	readonly state: "pending";
	readonly evidence: null;
}

const clean = (value: unknown, max = 180): string =>
	String(value ?? "")
		.replace(
			/(?:bearer\s+|(?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi,
			"[redacted]",
		)
		.split("")
		.map((c) =>
			c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || "<>".includes(c)
				? " "
				: c,
		)
		.join("")
		.slice(0, max);
const error = (code: string, message: string): Error =>
	Object.assign(new Error(message), { code });
const MCP_CONFIG_FILE = /(?:^|[\\/])(?:\.?mcp|mcp-adapter)\.json$/i;

/** Normalize a model-authored plan before the host opens or mutates a task. */
export function normalizeTaskMilestones(
	input: readonly TaskMilestoneInput[],
	catalog: MilestoneAcceptanceCatalog,
): readonly TaskPlanMilestone[] {
	if (!Array.isArray(input) || !input.length || input.length > 24)
		throw error("plan-limit", "Plan needs 1–24 milestones.");
	const badId = input.find((m) => !/^[a-zA-Z0-9_-]{1,40}$/.test(String(m.id)));
	if (badId)
		throw error(
			"plan-id-format",
			`Milestone ID ${JSON.stringify(String(badId.id).slice(0, 60))} is invalid: use 1–40 letters, digits, "-" or "_".`,
		);
	const ids = new Set(input.map((m) => m.id));
	if (ids.size !== input.length)
		throw error("plan-id", "Milestone IDs must be unique.");
	const seen = new Set<string>();
	return input.map((m) => {
		if ((m.dependsOn || []).some((id: string) => !seen.has(id)))
			throw error(
				"plan-dependency",
				"Dependencies must refer to earlier milestones, not cycles or missing IDs.",
			);
		if (!catalog.kinds.includes(m.acceptance?.kind))
			throw error(
				"acceptance-required",
				`Acceptance must be one of ${catalog.kinds.join(" | ")} (observed by the host or confirmed by the user); model labels cannot complete it.`,
			);
		if (
			m.acceptance.kind === "file" &&
			MCP_CONFIG_FILE.test(String(m.acceptance.path || ""))
		)
			throw error(
				"acceptance-config-write",
				"Writing an MCP config file (mcp.json) does not load MCP tools, so it cannot complete a milestone. Use human_review, or finish only after the mcp tool actually ran in a reloaded session; if no MCP tools are available, tell the user instead.",
			);
		const acceptance: Record<string, unknown> = {
			kind: m.acceptance.kind,
			path: clean(m.acceptance.path, 512),
			sha256: /^[a-f0-9]{64}$/.test(String(m.acceptance.sha256 || ""))
				? m.acceptance.sha256
				: null,
		};
		if (
			["workspace", "vault", "research-run"].includes(
				String(m.acceptance.rootKind),
			)
		)
			acceptance.rootKind = m.acceptance.rootKind;
		for (const field of catalog.fields[m.acceptance.kind] || [])
			acceptance[field] = clean(m.acceptance[field]);
		seen.add(m.id);
		return {
			id: m.id,
			title: clean(m.title),
			dependsOn: [...(m.dependsOn || [])],
			acceptance,
			state: "pending",
			evidence: null,
		};
	});
}
