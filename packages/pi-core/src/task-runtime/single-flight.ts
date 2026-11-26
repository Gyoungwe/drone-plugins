interface CommandContext {
	sessionManager?: { getSessionId?(): string };
	sessionId?: string;
	cwd: string;
}

function singleFlightCommand<Context extends CommandContext, Result>(
	handler: (args: string, ctx: Context) => Result | Promise<Result>,
) {
	const pending = /* @__PURE__ */ new Map<string, Promise<Result>>();
	return async (args: string, ctx: Context) => {
		if (args.length > 6e3) throw new Error("Task command too large.");
		const key = JSON.stringify([ctx.sessionManager?.getSessionId?.() || ctx.sessionId, ctx.cwd, args]);
		const existing = pending.get(key);
		if (existing) return existing;
		const run = Promise.resolve().then(() => handler(args, ctx));
		pending.set(key, run);
		try {
			return await run;
		} finally {
			pending.delete(key);
		}
	};
}

export { singleFlightCommand };
