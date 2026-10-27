import { basename } from "node:path";
import type { SemanticSettingsApi } from "../core/semantic-settings.js";
import type { KnowledgeReadOwner } from "./read-model.js";
import type { KnowledgeSemanticPreferences, KnowledgeSetSemanticSettingsInput } from "./contract.js";

export function createKnowledgeSemanticPreferences(owner:KnowledgeReadOwner,semantic:SemanticSettingsApi,canWriteState:boolean){
 async function snapshot():Promise<KnowledgeSemanticPreferences>{
  const binding=await owner.config.readKnowledgeBinding({fresh:true});
  if(!binding)return {binding:null,settings:null,canWriteState,providerExecution:"unavailable"};
  const settings=await semantic.readSemanticSettings(binding.vaultId);
  return owner.config.withKnowledgeBinding(binding,()=>({binding:{vaultId:binding.vaultId,revision:binding.revision,label:basename(binding.vault)},settings,canWriteState,providerExecution:"unavailable" as const}));
 }
 return {
  read:()=>owner.run(snapshot),
  write:(input:KnowledgeSetSemanticSettingsInput)=>owner.run(async()=>{
   if(!canWriteState)throw new Error("Semantic settings require an application-state write grant");
   const binding=await owner.config.readKnowledgeBinding({fresh:true});
   if(!binding||binding.revision!==input.bindingRevision)throw new Error("Knowledge binding changed; refresh before saving semantic settings");
   await owner.config.withKnowledgeBinding(binding,()=>semantic.saveSemanticSettings(binding.vaultId,input.settings,input.expectedSettingsRevision));
   await owner.config.withKnowledgeBinding(binding,()=>undefined);
   return snapshot();
  }),
 };
}
