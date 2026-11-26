import type { ExtensionContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";

/** User interaction through a real Pi extension context (the native adapter's ports). */
export const contextUi = {
	hasUI: (ctx: { ui?: Partial<Pick<ExtensionUIContext, "select">> }) => !!ctx.ui?.select,
	select: (
		ctx: { ui: Pick<ExtensionUIContext, "select"> },
		text: string,
		options: string[],
		signal?: AbortSignal,
	) => ctx.ui.select(text, options, { signal }),
	input: (
		ctx: { ui: Pick<ExtensionUIContext, "input"> },
		title: string,
		placeholder?: string,
		signal?: AbortSignal,
	) => ctx.ui.input(title, placeholder, { signal }),
	idle: (ctx: Partial<Pick<ExtensionContext, "isIdle">>) => !ctx.isIdle || ctx.isIdle(),
};
