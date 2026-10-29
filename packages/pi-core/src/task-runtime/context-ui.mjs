/** User interaction through a real Pi extension context (the native adapter's ports). */
export const contextUi = {
  hasUI: ctx => !!ctx.ui?.select,
  select: (ctx, text, options, signal) => ctx.ui.select(text, options, { signal }),
  input: (ctx, title, placeholder, signal) => ctx.ui.input(title, placeholder, { signal }),
  idle: ctx => !ctx.isIdle || ctx.isIdle(),
};
