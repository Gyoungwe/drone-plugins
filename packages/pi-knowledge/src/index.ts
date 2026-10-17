/**
 * Public source marker for the prebuilt Pi extension.
 *
 * The implementation is intentionally shipped as the checked-in, self-contained
 * `dist/index.mjs` artifact. The implementation's Drone host sources are not
 * copied into this repository and are never a runtime dependency of the package.
 * The package-local build/check script verifies that artifact and its worker.
 */
export const pluginId = "@gyoungwe/pi-knowledge" as const;
export const entrypoint = "./dist/index.mjs" as const;
export const pluginApiVersion = 1 as const;
