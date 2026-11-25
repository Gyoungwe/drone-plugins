import { createTaskApplicationState } from "./application-state.js";
import { type NativeTaskHost, registerWorkbench } from "./native-adapter.js";
import { bindRuntime, runtimeForHost, withHostRuntime } from "./runtime-bridge.js";
import type { TaskJournal, WorkbenchAdapterOptions } from "./workbench-adapter.js";

export {
	continuesTask,
	createTaskJournal,
	isTaskStatusQuery,
	TASK_DOCUMENT_KIND,
	TASK_ENTRY,
} from "./legacy-checkpoint.js";

export interface TaskRuntimeRegistry {
	version: 1;
	journal: TaskJournal | null;
	runtime: ReturnType<typeof runtimeForHost>;
	owner?: { dispose(): Promise<void> };
	unsubscribe?: () => void;
}

type RuntimeOptions = Partial<WorkbenchAdapterOptions> & { runtime?: TaskRuntimeRegistry["runtime"] };

export function registerTaskRuntime(pi: NativeTaskHost, options: RuntimeOptions = {}) {
	const shared = requestSharedTaskRuntime(pi);
	bindRuntime(pi, shared?.runtime || options.runtime);
	const hostRuntime = runtimeForHost(pi);
	hostRuntime.tasks ??= {};
	const local = hostRuntime.tasks.workbench;
	if (local?.journal) {
		local.journal.configure?.(options);
		return local.journal;
	}
	if (shared?.journal) {
		shared.journal.configure?.(options);
		hostRuntime.tasks.workbench = { ...local, ...shared };
		return shared.journal;
	}
	const registry: TaskRuntimeRegistry = { version: 1, journal: null, runtime: hostRuntime };
	const journal = withHostRuntime(pi, () =>
		registerWorkbench(pi, {
			...options,
			application: options.application || createTaskApplicationState(),
			onJournalAttached(current) {
				registry.journal = current;
				if (hostRuntime.tasks.workbench) hostRuntime.tasks.workbench.journal = current;
			},
		}),
	);
	registry.journal = journal;
	hostRuntime.tasks.workbench = { ...local, version: 1, journal, runtime: hostRuntime };
	publishTaskRuntimeRegistry(pi, registry);
	return journal;
}

const TASK_RUNTIME_REQUEST = "drone:task-runtime/request/v1";
const TASK_RUNTIME_RESPONSE = "drone:task-runtime/v1";

export function requestSharedTaskRuntime(pi: NativeTaskHost) {
	const events = pi?.events;
	if (!events?.on || !events.emit) return null;
	const result: { shared: TaskRuntimeRegistry | null } = { shared: null };
	const unsubscribe = events.on(TASK_RUNTIME_RESPONSE, (value) => {
		const payload = value as { version?: number; registry?: TaskRuntimeRegistry } | null;
		if (payload?.version === 1 && payload.registry?.journal) result.shared = payload.registry;
	});
	events.emit(TASK_RUNTIME_REQUEST, { version: 1 });
	unsubscribe?.();
	return result.shared;
}

function publishTaskRuntimeRegistry(pi: NativeTaskHost, registry: TaskRuntimeRegistry) {
	const events = pi?.events;
	if (!events?.on || !events.emit) return;
	registry.unsubscribe = events.on(TASK_RUNTIME_REQUEST, (value) => {
		const payload = value as { version?: number } | null;
		if (payload?.version === 1) events.emit(TASK_RUNTIME_RESPONSE, { version: 1, registry });
	});
	registry.runtime.registerDisposable({ dispose: registry.unsubscribe });
}
