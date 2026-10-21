/** Public package source entry for the native Pi extension. */
export { default } from "./extension/knowledge-extension.js";
export const pluginId = "@gyoungwe/pi-knowledge" as const;
export const entrypoint = "./dist/index.mjs" as const;
export const pluginApiVersion = 1 as const;
