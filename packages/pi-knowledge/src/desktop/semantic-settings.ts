import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { createStoredSemanticSettingsApi, type SemanticSettingsDocument } from "../core/semantic-settings.js";

export function createBrokerSemanticSettings(capabilities:PluginRuntimeCapabilities,root:string) {
 return createStoredSemanticSettingsApi({
  read:async vaultId=>await capabilities.call("state.readJson",{root,path:`${vaultId}/semantic.json`}) as SemanticSettingsDocument,
  async write(vaultId,value,expectedVersion) {
   // Creating the state subdirectory is an explicit write capability, never a read side effect.
   await capabilities.call("state.ensureDirectory",{root,path:vaultId});
   await capabilities.call("state.writeJson",{root,path:`${vaultId}/semantic.json`,value,expectedVersion});
  },
 });
}
