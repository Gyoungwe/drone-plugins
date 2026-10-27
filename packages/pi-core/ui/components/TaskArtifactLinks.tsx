import type { WorkbenchTask } from "@gyoungwe/plugin-api/ui";
import { useSessionsStore, useUiStore } from "../api";
import { taskArtifactLinks } from "../artifacts";
import { useTaskText } from "../copy";

export function TaskArtifactLinks({
	task,
	sessionId,
}: {
	task: WorkbenchTask;
	sessionId: string | null;
}) {
	const t = useTaskText();
	const cwd = useSessionsStore(
		(state) =>
			state.sessions.find((session) => session.sessionId === sessionId)?.cwd,
	);
	const open = useUiStore((state) => state.openResourcePreview);
	const files = taskArtifactLinks(task);
	if (!files.length) return null;
	return (
		<div
			className="mt-2 flex flex-wrap gap-2 text-xs"
			data-testid="task-artifacts"
		>
			{files.slice(0, 6).map((file) => (
				<a
					key={file.href}
					href={file.href}
					className="max-w-full break-all rounded border border-border px-2 py-1 underline underline-offset-2 hover:bg-hover"
					aria-disabled={!cwd && file.href.startsWith("./")}
					title={
						!cwd && file.href.startsWith("./")
							? t("taskArtifacts.openSessionFirst")
							: file.path
					}
					onClick={(event) => {
						event.preventDefault();
						if (!cwd && file.href.startsWith("./")) return;
						open({
							href: file.href,
							label: file.path.split(/[\\/]/).pop(),
							cwd,
						});
					}}
				>
					{file.path.split(/[\\/]/).pop()} ·{" "}
					{file.state === "changed"
						? t("taskArtifacts.changed")
						: file.state === "not-found"
							? t("taskArtifacts.notFound")
							: t("taskArtifacts.preview")}
				</a>
			))}
			{files.length > 6 && (
				<span>{t("taskArtifacts.more", { count: files.length - 6 })}</span>
			)}
		</div>
	);
}
