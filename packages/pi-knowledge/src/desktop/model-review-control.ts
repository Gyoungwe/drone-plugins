/** Foreground admission belongs to one desktop runtime owner. */
export function createModelReviewControl() {
	const limit = 2;
	const deadlineMs = 120_000;
	let active = 0;
	return {
		async run<T>(
			callerSignal: AbortSignal,
			project: () => Promise<string | null>,
			operation: (project: string | null, signal: AbortSignal) => Promise<T>,
		): Promise<T> {
			if (active >= limit) throw new Error("Model review is already running; wait or cancel it");
			active++;
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), deadlineMs);
			const cancel = () => controller.abort(callerSignal.reason);
			callerSignal.addEventListener("abort", cancel, { once: true });
			try {
				if (callerSignal.aborted) cancel();
				const resolvedProject = await resolveProject(project, controller.signal);
				controller.signal.throwIfAborted();
				return await operation(resolvedProject, controller.signal);
			} finally {
				clearTimeout(timer);
				callerSignal.removeEventListener("abort", cancel);
				active--;
			}
		},
	};
}

async function resolveProject(project: () => Promise<string | null>, signal: AbortSignal) {
	let rejectOnAbort: (reason: unknown) => void;
	const aborted = new Promise<never>((_resolve, reject) => {
		rejectOnAbort = reject;
	});
	const abort = () => rejectOnAbort(signal.reason);
	signal.addEventListener("abort", abort, { once: true });
	try {
		signal.throwIfAborted();
		// The resolver contract has no signal parameter, so cancellation must stop waiting for it.
		return await Promise.race([project(), aborted]);
	} finally {
		signal.removeEventListener("abort", abort);
	}
}
