import type { TaskView } from "@gyoungwe/plugin-api/ui";
import { useTaskText } from "../copy";
import { taskStorage } from "../storage";

export function TaskStorageNotice({ view }: { view: TaskView }) {
	const t = useTaskText();
	const storage = taskStorage(view);
	if (storage?.state === "durable") return null;
	const key = !storage
		? "storage.unknown"
		: storage.state === "needs-reopen"
			? "storage.failed"
			: storage.mode === "memory"
				? "storage.memory"
				: "storage.deferred";
	return (
		<p
			className="mt-2 text-xs text-warn"
			role="status"
			data-task-storage={storage?.state || "unknown"}
		>
			{t(key)}
		</p>
	);
}
