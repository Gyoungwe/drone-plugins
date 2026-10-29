import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { createTaskApplicationState } from "./application-state.mjs";
import { createTaskController } from "./task-controller.mjs";
import { createTaskSession, TASK_SESSION_ENTRY } from "./task-session.mjs";
import { createStandaloneRuntime, withRuntime } from "./runtime-bridge.mjs";

const empty = {type:"null"};
const statusSchema = {type:"object",properties:{snapshot:{},render:{type:"string"},storage:{}},required:["snapshot","render","storage"],additionalProperties:false};

/** Data/status vertical of the canonical application. It has no execution grant,
 * file adapter, continuation producer, legacy importer or production manifest yet.
 */
export function createManagedTaskApplication(context) {
  const application=createTaskApplicationState();
  const invocation=new AsyncLocalStorage();
  const sessions=new Set(), attached=new Map();
  const lifetime=new AbortController();
  const run=(session,signal,operation)=>withRuntime(session.runtime,()=>invocation.run(signal,operation));
  const signalFor=signal=>AbortSignal.any([context.signal,lifetime.signal,...(signal?[signal]:[])]);
  const readScope=async signal=>{
    const scope=await context.capabilities.call("caller.scope",null,signal);
    if(scope.kind!=="session")throw new Error("Task data service requires an actual attached SDK session");
    return scope;
  };
  const keyFor=scope=>createHash("sha256").update(`${scope.sessionId}\0${scope.workspaceDirectory}`).digest("hex");
  const project=session=>{
    const state=session.actor.status(), task=state.snapshot;
    return {
      snapshot:task?{
        id:task.id,goal:task.goal,state:task.state,reason:task.reason??null,
        milestones:task.milestones.map(({id,title,state,dependsOn})=>({id,title,state,dependsOn})),
        budget:task.budget,
        pending:task.operations.filter(operation=>["started","unknown"].includes(operation.state)).map(({id,tool,state})=>({id,tool,state})),
      }:null,
      render:state.render,
      storage:state.storage,
    };
  };
  const withCurrentSession=async(signal,operation)=>{
    const current=signalFor(signal),scope=await readScope(current),session=attached.get(keyFor(scope));
    if(!session)throw new Error("Task data service has no native attachment for this SDK session");
    current.throwIfAborted();
    const result=await run(session,current,()=>operation(session));
    current.throwIfAborted();
    return result;
  };
  const operation=(effect,inputSchema,execute,resultSchema=statusSchema)=>({effect,inputSchema,resultSchema,
    execute:(input,call)=>withCurrentSession(call.signal,async session=>{
      await session.refresh(call.signal);
      return execute(input,session);
    }),
  });
  const operations={
    status:operation("read",empty,(_input,session)=>project(session)),
    pause:operation("write",{type:"object",properties:{reason:{type:"string",minLength:1,maxLength:128}},required:["reason"],additionalProperties:false},async(input,session)=>{await session.controller.journal.pause(input.reason);return project(session);}),
    advanceStage:operation("write",empty,async(_input,session)=>{const advanced=await session.controller.journal.advanceStage();return {...project(session),advanced};},{...statusSchema,properties:{...statusSchema.properties,advanced:{type:"boolean"}},required:[...statusSchema.required,"advanced"]}),
    takeReport:operation("write",empty,async(_input,session)=>{const report=await session.controller.journal.takeReport();return {...project(session),report};},{...statusSchema,properties:{...statusSchema.properties,report:{type:["string","null"]}},required:[...statusSchema.required,"report"]}),
  };
  const createNativeSession=()=>{
    lifetime.signal.throwIfAborted();
    const runtime=createStandaloneRuntime();
    const own=new AbortController();let key,scope;
    let tools=new Map();
    const currentSignal=()=>AbortSignal.any([signalFor(invocation.getStore()),own.signal]);
    const read=async signal=>{
      const observed=await context.capabilities.call("session.records.read",null,signal);
      return observed;
    };
    const actor=withRuntime(runtime,()=>createTaskSession({
      persist:async(record,signal)=>{
        const receipt=await context.capabilities.call("session.records.append",{type:record.customType,data:record.data},signal);
        const observed=await read(signal);
        if(observed.state==="needs-reopen")throw new Error("Task storage needs-reopen: "+observed.error);
        if(!observed.records.some(row=>row.id===receipt.id&&row.type===record.customType))throw new Error("Task checkpoint is no longer on the actual SDK branch");
        return {mode:observed.mode,state:observed.state};
      },
      readOnly:name=>tools.get(name)===true,
      onChanged:()=>context.events.changed(),
      readFailure:()=>application.readFailure(key),
      onPersistenceFailed:failure=>application.recordFailure(key,failure),
    }));
    const controller=createTaskController(actor,currentSignal);
    const session={actor,controller,runtime,
      refresh:async signal=>{
        const observed=await read(signal);
        tools=new Map((await context.capabilities.call("session.tools",null,signal)).map(tool=>[tool.name,tool.readOnlyHint]));
        if(observed.state==="needs-reopen"&&!application.readFailure(key))application.recordFailure(key,{state:"needs-reopen",message:observed.error,lastCommitted:actor.status()});
        if(!application.readFailure(key))await actor.turn({kind:"storage",storage:observed},signal);
      },
      attach:async(signal,force)=>{
        const selected=await readScope(signal),selectedKey=keyFor(selected);
        if(key&&key!==selectedKey)throw new Error("Task native attachment cannot switch SDK sessions");
        if(attached.has(selectedKey)&&attached.get(selectedKey)!==session)throw new Error("Task SDK session already has a native owner");
        const observed=await read(signal);
        const entries=observed.records.filter(row=>row.type===TASK_SESSION_ENTRY).map(row=>({customType:row.type,data:row.data}));
        tools=new Map((await context.capabilities.call("session.tools",null,signal)).map(tool=>[tool.name,tool.readOnlyHint]));
        key=selectedKey;scope=selected;
        if(!application.readFailure(key))await run(session,signal,()=>actor.turn({kind:"attach",scope:selectedKey,entries,storage:observed,force},signal));
        if(observed.state==="needs-reopen"&&!application.readFailure(key))application.recordFailure(key,{state:"needs-reopen",message:observed.error,lastCommitted:actor.status()});
        attached.set(key,session);
      },
      dispose:async()=>{own.abort(new Error("Managed task attachment closed"));await actor.close();await runtime.dispose();if(attached.get(key)===session)attached.delete(key);sessions.delete(session);},
    };
    sessions.add(session);
    return {
      eventEffects:{session_start:"read",session_tree:"read",context:"read"},
      extension:pi=>{
        pi.on("session_start",async(_event,ctx)=>session.attach(signalFor(ctx.signal),true));
        pi.on("session_tree",async(_event,ctx)=>session.attach(signalFor(ctx.signal),true));
        pi.on("context",async(_event,ctx)=>{
          const selected=await readScope(signalFor(ctx.signal));
          if(!scope||keyFor(selected)!==key)throw new Error("Task context has no current SDK attachment");
          await run(session,signalFor(ctx.signal),()=>session.refresh(signalFor(ctx.signal)));
        });
      },
      dispose:session.dispose,
    };
  };
  return {operations,createNativeSession,withCurrentSession,
    dispose:async()=>{lifetime.abort(new Error("Managed task application closed"));await Promise.all([...sessions].map(session=>session.dispose()));},
  };
}
