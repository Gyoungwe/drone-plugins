import type { PluginRuntimeFactoryContext, PluginResourcesLifecycle } from "@gyoungwe/plugin-api/runtime";
import type { KnowledgeBinding } from "../core/config.js";
import type { KnowledgeServiceTransport, KnowledgeServiceTransportFactory } from "../core/service-transport.js";
import type { KnowledgeWorkerLifecycleStage } from "../core/runtime-host.js";

/** Actual resource handles, never synthetic filesystem paths or a fake Worker. */
export function createResourceServiceTransportFactory(context:PluginRuntimeFactoryContext,state:string,lifecycle:PluginResourcesLifecycle):KnowledgeServiceTransportFactory & {dispose():Promise<void>} {
 const metadata={version:"unknown"}; // The public resource handle does not disclose an artifact digest.
 const transports=new Set<ResourceTransport>();
 let shutdown:Promise<void>|null=null;
 class ResourceTransport implements KnowledgeServiceTransport {
  closed=false;
  closing=false;
  lifecycle:KnowledgeWorkerLifecycleStage="staged";
  readonly metadata=metadata;
  readonly version=metadata.version;
  private opening:Promise<{handle:string}>;
  private pending=new Set<Promise<unknown>>();
  private closePromise:Promise<void>|null=null;
  constructor(binding:KnowledgeBinding) {
   this.opening=(async()=>{
    const vault=await context.capabilities.call("roots.resolve",{path:binding.vault,kind:"files"}) as {handle:string};
    return await context.capabilities.call("resource.create",{resource:"index",storage:{root:state,key:binding.vaultId},parameters:{vaultRoot:vault.handle},reservation:{namespace:"knowledge-writers",roots:[{root:vault.handle,path:"",kind:"vault"}],storage:{path:"index.sqlite",kind:"index"}}}) as {handle:string};
   })();
  }
  get pendingRequestCount(){return this.pending.size;}
  async waitUntilReady(){await this.opening;return {version:this.version};}
  request(operation:string,input:Record<string,unknown>={}) {
   if(this.closed||this.closing||shutdown)return Promise.reject(new Error("Knowledge service is closed"));
   const request=this.opening.then(resource=>context.capabilities.call("resource.invoke",{handle:resource.handle,operation,input}));
   this.pending.add(request);
   return request.finally(()=>this.pending.delete(request));
  }
  prepareUnload(){return {pendingRequests:this.pending.size,version:this.version};}
  close():Promise<void> {
   if(this.closePromise)return this.closePromise;
   this.closing=true;this.lifecycle="disabled";
   const close=(async()=>{
    if(shutdown){await shutdown;}
    else {
     // Each caller receives its request failure; closure separately waits for settlement and actual exit.
     await Promise.allSettled([...this.pending]);
     const resource=await this.opening;
     await context.capabilities.call("resource.dispose",{handle:resource.handle});
    }
    this.closed=true;this.lifecycle="drained";
   })();
   this.closePromise=close.catch(error=>{
    // A cancelled caller may miss a successful host close receipt. A later live
    // caller must re-await that same host receipt; failures never count as drained.
    this.closePromise=null;throw error;
   });
   return this.closePromise;
  }
 }
 return {
  metadata:()=>metadata,
  resourceKey:binding=>JSON.stringify([state,"index",binding.vaultId]),
  create({binding}) {
   if(shutdown)throw new Error("Knowledge resource owner is closing");
   const transport=new ResourceTransport(binding);transports.add(transport);return transport;
  },
  dispose() {
   if(!shutdown)shutdown=lifecycle.dispose().then(()=>{for(const transport of transports){transport.closed=true;transport.closing=true;transport.lifecycle="drained";}});
   return shutdown;
  },
 };
}
