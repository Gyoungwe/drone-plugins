import type { TaskMilestone } from "@gyoungwe/plugin-api/ui";
import { openExternal, openResourceExternal, useSessionsStore } from "../api";

/** Evidence records are presentation input; this component cannot approve them. */
export function MilestoneEvidence({
	milestone,
	sessionId,
}: {
	milestone: TaskMilestone;
	sessionId: string | null;
}) {
	const cwd = useSessionsStore(
		(state) =>
			state.sessions.find((session) => session.sessionId === sessionId)?.cwd,
	);
	if (
		milestone.acceptance.kind === "file" ||
		milestone.acceptance.kind === "human_review"
	)
		return null;
	const { acceptance, evidence } = milestone;
	const state =
		milestone.state === "completed" ? "found" : evidence?.state || "pending";
	const fields = Object.entries(acceptance).filter(
		([key, value]) =>
			!["kind", "path", "sha256"].includes(key) &&
			typeof value === "string" &&
			value,
	);
	return (
		<div className="ml-5 mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-dim">
			<span>{evidence?.summary || state}</span>
			{evidence?.note && (
				<span className="text-ink-faint">{evidence.note}</span>
			)}
			{state !== "found" && evidence?.reason && !evidence.summary && (
				<span>{evidence.reason}</span>
			)}
			{fields.map(([key, value]) => (
				<code key={key} className="break-all text-ink-faint" title={key}>
					{value}
				</code>
			))}
			{evidence?.links
				?.filter((link) => link.kind !== "note")
				.map((link) => (
					<button
						key={`${link.kind}:${link.target}`}
						type="button"
						className="text-link hover:underline"
						onClick={() =>
							void (link.kind === "external"
								? openExternal(link.target)
								: openResourceExternal(link.target, cwd))
						}
					>
						{link.label}
					</button>
				))}
		</div>
	);
}
