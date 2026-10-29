import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { resolveWriteRoots } from "./consent.mjs";
import { contextUi } from "./context-ui.mjs";
import { readNativeSessionStorage } from "./native-storage.mjs";
import { registerWorkbenchAdapter } from "./workbench-adapter.mjs";
import { inspectTaskFile } from "./workbench.mjs";

const AUTO_CONTINUE = "drone-task-autocontinue";

/** Ports of the raw native Pi adapter: the real SDK APIs of the session it is loaded into. */
function nativePorts(pi) {
  return {
    readKnowledgeBinding: () => pi?.drone?.readKnowledgeBinding?.() || null,
    onHostEvent: (name, handler) => pi.events?.on?.(name, handler),
    readOnlyHint: name => pi.getAllTools().find(tool => tool.name === name)?.annotations?.readOnlyHint,
    storage: ctx => readNativeSessionStorage(ctx.sessionManager),
    persist: async (ctx, record, signal) => {
      signal.throwIfAborted();
      const before=readNativeSessionStorage(ctx.sessionManager);
      if(before.state==="needs-reopen") throw new Error(`Task storage needs-reopen: ${before.code}`);
      await pi.appendEntry(record.customType, record.data);
      signal.throwIfAborted();
      const after=readNativeSessionStorage(ctx.sessionManager);
      if(after.state==="needs-reopen") throw new Error(`Task storage needs-reopen: ${after.code}`);
      return {mode:after.mode,state:after.state};
    },
    post: (_ctx, { content, command, view, storage }) => pi.sendMessage(
      {
        customType: "drone-task-status",
        display: true,
        content,
        details: { operational: true, reportId: randomUUID(), command, taskView: view, taskStorage: storage }
      },
      { triggerTurn: false }
    ),
    notifyError: (ctx, text) => ctx.ui.notify(text, "error"),
    ...contextUi,
    capabilities: ctx => [...ctx.sessionManager.getBranch()].reverse()
      .find((e) => e.customType === "drone-capability-checkpoint-v1")?.data?.capabilities || [],
    continueTask: (_ctx, { taskId, prompt, nonce }) => {
      pi.sendMessage(
        { customType: AUTO_CONTINUE, display: false, details: { taskId, nonce }, content: prompt },
        { triggerTurn: true, deliverAs: "followUp" }
      );
      return nonce;
    },
    continuationId: message => message?.role === "custom" && message.customType === AUTO_CONTINUE ? message.details?.nonce : undefined,
    sendUserMessage: (_ctx, text, options) => pi.sendUserMessage(text, options),
    decision: record => pi.events?.emit?.("drone:decision-record/v1", record),
    writeRoots: resolveWriteRoots,
    authorizeRead: async (ctx, cwd, path) => {
      if (!ctx || !pi.events?.emit)
        throw new Error("Current read-permission adapter unavailable; refusing recovery read.");
      const signal=ctx.signal;
      signal?.throwIfAborted();
      let handled = false;
      const allowed = await new Promise((resolveResult,reject) => {
        const stop=()=>signal?.removeEventListener("abort",abort);
        const respond=allowed=>{stop();resolveResult(allowed);};
        const abort=()=>{stop();reject(signal.reason);};
        signal?.addEventListener("abort",abort,{once:true});
        pi.events.emit("drone:task-read-check",{
          cwd,
          path: resolve(cwd,path),
          sessionId:ctx.sessionManager.getSessionId(),
          resolve:respond,
          claim:()=>{handled=true;},
        });
        if (!handled) respond(false);
      });
      signal?.throwIfAborted();
      if (!allowed) throw new Error("Current permission policy denied this read.");
    },
    inspect: async (_ctx, cwd, path, expected, { journal, readKnowledgeBinding, authorize }) => {
      const binding = await readKnowledgeBinding();
      if (journal.snapshot()?.reason === "binding-changed")
        throw new Error("Knowledge binding changed; this task cannot inspect the new destination.");
      const declaredBinding = journal.snapshot()?.binding;
      if (declaredBinding !== void 0 && declaredBinding !== (binding ? `${binding.vaultId}:${binding.revision}` : null))
        throw new Error("Knowledge binding changed; reconcile the original task scope first.");
      const vault = binding?.vault ? await realpath(binding.vault) : null;
      const requestedRoot = expected.rootKind || "workspace";
      if (requestedRoot === "vault" && !vault)
        throw new Error("Vault file acceptance requires a current knowledge binding.");
      const base = requestedRoot === "vault" ? vault : cwd;
      const full = resolve(base, path);
      const contains = (root2) => {
        const rel = relative(root2, full);
        return !!rel && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
      };
      if (requestedRoot === "vault" && !contains(vault))
        throw new Error("Vault artifact must remain inside the bound Vault.");
      const approvedRoot = journal.readRoots().find(contains);
      const root = requestedRoot === "vault" ? vault : approvedRoot || cwd;
      await authorize(cwd, full);
      if (approvedRoot && relative(approvedRoot, await realpath(approvedRoot)) !== "")
        throw new Error("Approved directory identity changed.");
      const rootKind = vault && contains(vault) ? "vault" : requestedRoot;
      const artifact = await inspectTaskFile(root, full, { ...expected, rootKind });
      return {
        ...artifact,
        path: rootKind === "vault" ? relative(vault, artifact.absolutePath).replaceAll("\\", "/") : (isAbsolute(path) ? artifact.absolutePath : relative(cwd, artifact.absolutePath)).replaceAll(
          "\\",
          "/"
        )
      };
    },
    evidenceFiles: {inspect:inspectTaskFile,readText:path=>readFile(path,"utf8")},
  };
}

function registerWorkbench(pi, options = {}) {
  return registerWorkbenchAdapter(pi, nativePorts(pi), options);
}
export {
  registerWorkbench
};
