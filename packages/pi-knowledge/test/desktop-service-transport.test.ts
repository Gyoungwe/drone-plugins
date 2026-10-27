import { expect, it, vi } from "vitest";
import { createResourceServiceTransportFactory } from "../src/desktop/service-transport.js";
import type { KnowledgeBinding } from "../src/core/config.js";
const binding:KnowledgeBinding={version:1,vault:"/authorized/Vault",vaultId:"0123456789abcdef01234567",revision:1,profile:"hybrid",depositMode:"verified",subagentPolicy:"none",updatedAt:new Date(0).toISOString()};
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}

it("re-awaits the actual active close receipt after caller cancellation and waits for activation close",async()=>{
 const barrier=deferred<void>();const lifecycle={dispose:vi.fn(()=>barrier.promise)};
 let calls=0,physicallyClosed=false;
 const context={applicationId:"test",resources:[],signal:new AbortController().signal,events:{changed(){}},capabilities:{async call(name:string){
  if(name==="roots.resolve")return {handle:"vault"};if(name==="resource.create")return {handle:"owned"};
  if(name==="resource.dispose"){calls++;physicallyClosed=true;if(calls===1)throw new Error("Caller revoked after child close");return null;}
  throw new Error(`Unexpected ${name}`);
 }}};
 const factory=createResourceServiceTransportFactory(context,"state",lifecycle);const transport=factory.create({binding});await transport.waitUntilReady();
 await expect(transport.close()).rejects.toThrow("revoked");expect(physicallyClosed).toBe(true);expect(transport.closed).toBe(false);expect(transport.lifecycle).not.toBe("drained");
 const retry=transport.close();expect(transport.close()).toBe(retry);await retry;expect(calls).toBe(2);expect(transport.closed).toBe(true);
 let done=false;const disposing=factory.dispose().then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);expect(lifecycle.dispose).toHaveBeenCalledTimes(1);
 barrier.resolve();await disposing;expect(calls).toBe(2);await expect(transport.request("status")).rejects.toThrow("closed");
});

it("does not call an unreturned handle closed until the real activation resource barrier completes",async()=>{
 const barrier=deferred<void>(),lifecycle={dispose:vi.fn(()=>barrier.promise)};const capabilityNames:string[]=[];
 const context={applicationId:"test",resources:[],signal:new AbortController().signal,events:{changed(){}},capabilities:{async call(name:string){
  capabilityNames.push(name);if(name==="roots.resolve")return {handle:"vault"};
  if(name==="resource.create")throw new Error("Caller revoked after resource acquisition");
  throw new Error(`No handle was returned for ${name}`);
 }}};
 const factory=createResourceServiceTransportFactory(context,"state",lifecycle),transport=factory.create({binding});
 await expect(transport.waitUntilReady()).rejects.toThrow("revoked");await expect(transport.close()).rejects.toThrow("revoked");expect(transport.closed).toBe(false);
 const shutting=factory.dispose();const closing=transport.close();expect(transport.closed).toBe(false);barrier.resolve();await Promise.all([shutting,closing]);expect(transport.closed).toBe(true);expect(capabilityNames).toEqual(["roots.resolve","resource.create"]);
});

it("drains requests accepted before an active close and retains a failed resource barrier",async()=>{
 const request=deferred<unknown>();let closeCalls=0;
 const context={applicationId:"test",resources:[],signal:new AbortController().signal,events:{changed(){}},capabilities:{async call(name:string){
  if(name==="roots.resolve")return {handle:"vault"};if(name==="resource.create")return {handle:"owned"};if(name==="resource.invoke")return request.promise;
  if(name==="resource.dispose"){closeCalls++;return null;}throw new Error(name);
 }}};
 const factory=createResourceServiceTransportFactory(context,"state",{dispose:async()=>{throw new Error("Child exit failed");}}),transport=factory.create({binding});
 const accepted=transport.request("read");const closing=transport.close();await transport.waitUntilReady();expect(closeCalls).toBe(0);expect(transport.pendingRequestCount).toBe(1);
 request.resolve({path:"Library/Methods/orchid.md"});await accepted;await closing;expect(closeCalls).toBe(1);
 await expect(factory.dispose()).rejects.toThrow("Child exit failed");await expect(factory.dispose()).rejects.toThrow("Child exit failed");
});
