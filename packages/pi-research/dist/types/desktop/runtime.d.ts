import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
/**
 * Desktop runtime: read-only research operations over host-granted roots, and per session the
 * Zotero tools, whose network goes through the host.
 */
declare const createDesktopRuntime: PluginNativeRuntimeFactory;
export default createDesktopRuntime;
