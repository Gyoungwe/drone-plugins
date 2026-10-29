import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { acceptanceSchema } from "./acceptance.mjs";
import { createTaskAuthorization } from "./ask-authorization.mjs";
import { createTaskSession } from "./task-session.mjs";
import { createTaskController } from "./task-controller.mjs";
import {
  FAILURE_EXPLANATION_POLICY,
  failureContext,
  failureObservation,
  TASK_HANDOFF_POLICY,
  taskProgressContext,
  toolResultFailed
} from "./failure-feedback.mjs";
import { hostLanguage } from "./host-language.mjs";
import { createTaskProgression } from "./progress-action.mjs";
import { currentRuntime, withHostRuntime } from "./runtime-bridge.mjs";
import { singleFlightCommand } from "./single-flight.mjs";
import { isTaskStatusQuery } from "./status-query.mjs";
import { isReadOnlyTool } from "./tool-manifest.mjs";
import { restoreTaskToolOrder } from "./tool-protocol.mjs";
import { shouldAskToContinue } from "./turn-end-prompt.mjs";
import { clean } from "./workbench.mjs";
/**
 * The task workbench choreography shared by both adapters. `pi` is used only for
 * on/registerTool/registerCommand; everything the two hosts do differently is a port:
 * the raw native Pi adapter (native-adapter.mjs) and the managed Desktop adapter
 * (managed-application.mjs) supply them.
 */
function registerWorkbenchAdapter(pi, ports, options = {}) {
  const invocation = new AsyncLocalStorage();
  const bindCallback = (handler, contextIndex = 1) => (...args) => withHostRuntime(pi, () => invocation.run(args[contextIndex], () => handler(...args)));
  const on = (name, handler) => pi.on(name, bindCallback(handler));
  const onEvent = (name, handler) => ports.onHostEvent?.(name, bindCallback(handler));
  let context, activeSessionId, prepared = false, awaitingUser = false, halted = false, readKnowledgeBinding = options.readKnowledgeBinding || ports.readKnowledgeBinding;
  let pendingStatus = null;
  let providerTurnOpen = false;
  const currentContext = () => invocation.getStore() || context;
  const authorize = (cwd, path) => ports.authorizeRead(currentContext(), cwd, path);
  const inspect = (cwd, path, expected = {}) => ports.inspect(currentContext(), cwd, path, expected, {
    journal, readKnowledgeBinding: () => readKnowledgeBinding(), authorize,
  });
  const session = createTaskSession({
    evidenceFiles: ports.evidenceFiles,
    readFailure: () => options.application.readFailure(activeSessionId),
    onPersistenceFailed: failure => options.application.recordFailure(activeSessionId,failure),
    readOnly: name => {
      const declared = ports.readOnlyHint(name);
      return declared !== undefined ? declared : withHostRuntime(pi, () => isReadOnlyTool(name));
    },
    persist: (record, signal) => ports.persist(currentContext(), record, signal),
    onChanged: () => send(), inspect, authorize,
  });
  const { journal, evidence } = createTaskController(session, () => invocation.getStore()?.signal);
  // Committed state and storage receipt, for adapters that serve status outside a hook.
  journal.status = () => session.status();
  const askAuthorization = createTaskAuthorization(journal, () => bindingKey(), ports);
  currentRuntime().registerDisposable({dispose:()=>session.close()});
  const attach = async (ctx, force = false) => {
    options.onJournalAttached?.(journal);
    context = ctx;
    activeSessionId = ctx.sessionManager.getSessionId();
    const scope = createHash("sha256").update(`${activeSessionId}\0${resolve(ctx.cwd)}`).digest("hex");
    const storage=await ports.storage(ctx);
    if (!options.application.readFailure(activeSessionId)) {
      await session.turn({kind:"attach",scope,entries:storage.entries,storage,force},ctx.signal);
      if(storage.state==="needs-reopen") options.application.recordFailure(activeSessionId,{
        state:"needs-reopen",message:storage.code,lastCommitted:session.status(),
      });
    }
  };
  journal.configure = (nextOptions = {}) => {
    if (nextOptions.readKnowledgeBinding) readKnowledgeBinding = nextOptions.readKnowledgeBinding;
  };
  const bindingKey = async () => {
    const b = await readKnowledgeBinding();
    return b ? `${b.vaultId}:${b.revision}` : null;
  };
  const send = (content = journal.render(), command = null) => {
    const state=session.status();
    if(state.persistence) throw new Error(`Task storage needs-reopen; last committed revision ${state.view.revision}. ${state.persistence.message}`);
    if (providerTurnOpen) {
      pendingStatus = { content, command };
      return;
    }
    pendingStatus = null;
    const failed = error => {
     options.application.recordFailure(activeSessionId,{state:"needs-reopen",message:error.message,lastCommitted:state});
     throw error;
    };
    try {
     const posted = ports.post(currentContext(), { content, command, view: journal.view(), storage: state.storage });
     // An asynchronous host records the failure without surfacing a rejection to a caller that
     // only displayed status.
     return posted instanceof Promise ? posted.catch(error => { try { failed(error); } catch {} }) : posted;
    } catch(error) {
     failed(error);
    }
  };
  let handoffGeneration = 0;
  let handoffTimer;
  let automaticTurn = false;
  let continuationToken = null;
  // While the host call that starts a continuation is in flight, its message may already be
  // delivered; only the host can create that message type, so it is recognized by type and task.
  let continuationPending = false;
  journal.isAutoContinuation = (message) => {
    const id = ports.continuationId(message);
    return !!(id && (id === continuationToken || continuationPending) && message.details?.taskId === journal.snapshot()?.id && journal.authorization());
  };
  const cancelHandoff = () => {
    handoffGeneration++;
    clearTimeout(handoffTimer);
    automaticTurn = false;
    continuationToken = null;
    continuationPending = false;
  };
  currentRuntime().registerDisposable({ dispose: cancelHandoff });
  const continueAuthorized = (ctx) => {
    const taskId = journal.snapshot()?.id;
    const generation = ++handoffGeneration;
    let idleChecks = 0;
    const handoff = async () => {
      if (generation !== handoffGeneration || context !== ctx || journal.snapshot()?.id !== taskId || !journal.authorization())
        return;
      let idle;
      try {
        // Inline: the host queues the follow-up behind a running turn, so no idle wait.
        idle = ports.inlineHandoff || await ports.idle(ctx);
      } catch {
        cancelHandoff();
        return;
      }
      if (!idle) {
        if (++idleChecks < 40) handoffTimer = setTimeout(() => void handoff().catch(cancelHandoff), 25);
        else {
          await journal.pause("auto-handoff-not-idle");
          send();
        }
        return;
      }
      try {
        const binding = await bindingKey();
        if (generation !== handoffGeneration || context !== ctx || journal.snapshot()?.id !== taskId) return;
        const result = await journal.begin("\u7EE7\u7EED", [], binding);
        if (result.blocked || ["blocked", "waiting_user"].includes(journal.snapshot()?.state) || !journal.authorization()) {
          send();
          return;
        }
        prepared = true;
        automaticTurn = true;
        continuationToken = randomUUID();
        continuationPending = true;
        try {
          continuationToken = await ports.continueTask(ctx, { taskId, nonce: continuationToken, prompt: `Continue the user-authorized task: ${journal.snapshot().goal}. Scope: ${journal.snapshot().authorizationSummary}. Use saved results, verify uncertain effects before any retry, and complete the remaining deliverables. Do not request routine stage approval. Respect declined installs and all permission/validation gates. If blocked, explain each remaining deliverable: actual evidence, confirmed blocker (or explicitly unknown cause), next action, and whether the user must decide. Use task_status for the latest remaining summary. Resolve routine gaps autonomously; create a specific task_wait only for genuinely needed input/approval. Never change acceptance criteria or mark an item complete to fill the progress bar.` });
        } finally {
          continuationPending = false;
        }
      } catch (e) {
        if (generation !== handoffGeneration || context !== ctx || journal.snapshot()?.id !== taskId || ["completed", "cancelled", "archived"].includes(journal.snapshot()?.state))
          return;
        await journal.pause("auto-handoff-failed");
        send(`\u6CA1\u80FD\u81EA\u52A8\u63A5\u7740\u505A\uFF1A${clean(e.message)}\u3002\u5DF2\u6709\u7684\u7ED3\u679C\u90FD\u5728\uFF0C\u6CA1\u6709\u91CD\u590D\u6267\u884C\u4EFB\u4F55\u64CD\u4F5C\u3002`);
      }
    };
    // A managed host only lends capabilities during the current invocation, so it hands off
    // inline (callers await this); the native host defers to a timer as before.
    if (ports.inlineHandoff) return handoff().catch(cancelHandoff);
    handoffTimer = setTimeout(() => void handoff().catch(cancelHandoff), 0);
  };
  on("session_shutdown", () => {
    cancelHandoff();
    activeSessionId = void 0;
    context = void 0;
  });
  // Native in-process host only: the managed host reads its own task grant instead.
  onEvent("drone:task-write-consent", (request) => {
    if (context && request.cwd === context.cwd && request.sessionId === context.sessionManager?.getSessionId?.())
      request.respond?.(journal.authorization(true));
  });
  const prepare = async (query, ctx) => {
    await attach(ctx);
    const caps = await ports.capabilities(ctx);
    const result = await journal.begin(query, caps, await bindingKey());
    halted = false;
    return result;
  };
  on("session_start", async (_event, ctx) => {
    cancelHandoff();
    providerTurnOpen = false;
    pendingStatus = null;
    await attach(ctx, true);
    prepared = false;
    awaitingUser = false;
  });
  on("session_tree", async (_event, ctx) => {
    cancelHandoff();
    providerTurnOpen = false;
    pendingStatus = null;
    await attach(ctx, true);
    prepared = false;
    halted = false;
  });
  on("input", async (event, ctx) => {
    if (session.status().persistence) {
      halted=true;
      await ports.notifyError(ctx, session.status().render);
      return {action:"handled"};
    }
    if (!event.images?.length && isTaskStatusQuery(event.text)) {
      await attach(ctx);
      send(void 0, "task-status");
      return { action: "handled" };
    }
    cancelHandoff();
    if (!await ports.idle(ctx)) return { action: "continue" };
    try {
      const result = await prepare(event.text, ctx);
      if (result.selectionRequired || result.blocked) {
        send();
        return { action: "handled" };
      }
      if (result.deferredReview && !result.stageReleased) send();
      prepared = true;
    } catch (e) {
      halted = true;
      if(session.status().persistence) await ports.notifyError(ctx, session.status().render);
      else send(`任务未开始：${clean(e.message)}
${journal.render()}`);
      return { action: "handled" };
    }
    return { action: "continue" };
  });
  on("before_agent_start", async (event, ctx) => {
    providerTurnOpen = true;
    if (!prepared) {
      try {
        await prepare(event.prompt, ctx);
      } catch {
        halted = true;
      }
    }
    prepared = false;
    awaitingUser = !automaticTurn;
    automaticTurn = false;
    return {
      systemPrompt: `${event.systemPrompt || ""}

${FAILURE_EXPLANATION_POLICY}

${TASK_HANDOFF_POLICY}`,
      message: {
        customType: "drone-task-context",
        display: false,
        content: `${journal.render()}
${hostLanguage() === "zh" ? "\uFF08\u4EE5\u4E0B\u4E3A\u5BBF\u4E3B\u7EA6\u675F\uFF0C\u5199\u7ED9\u7528\u6237\u770B\u7684\u5185\u5BB9\u4E00\u5F8B\u7528\u7B80\u4F53\u4E2D\u6587\u3002\uFF09\n" : ""}Host observations only. For substantial execution, first do read-only preparation, consolidate necessary choices/assumptions and call task_plan ONCE with the original user goal, a plain-language scope summary, existing write directories, and file-based deliverables. task_plan automatically opens the host ask_user form for task execution, directory writes, acceptance and automatic stage continuation. Task cards are status and request-entry UI, not consent. Do not duplicate the host question or treat free text as authorization. If declined, stop at the checkpoint. Additional authorization actions from task_wait also open ask_user. Within approved scope, perform routine steps and bounded recovery autonomously; only new risk/scope, credentials, genuinely unavailable user data or actual required human review need intervention. Never claim human/scientific review happened automatically. Prefer machine-checkable deliverables over unnecessary human-review milestones. Preserve prior refusals. File/command denies, sensitive files, unknown effects, total call budget and provenance checks remain binding. task_status delivers host-only results.`
      }
    };
  });
  on("message_start", async (event, ctx) => {
    if (journal.isAutoContinuation(event.message)) {
      prepared = false;
      automaticTurn = false;
      awaitingUser = false;
      const result = await journal.begin("\u7EE7\u7EED", [], await bindingKey());
      halted = !!result.blocked;
      return;
    }
    if (event.message.role !== "user") return;
    if (awaitingUser) {
      awaitingUser = false;
      return;
    }
    const content = event.message.content, query = typeof content === "string" ? content : (content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    try {
      const result = await prepare(query, ctx);
      if (result.selectionRequired || result.blocked) {
        halted = true;
        send();
      }
    } catch {
      halted = true;
    }
  });
  const refreshStorage = async ctx => session.turn({kind:"storage",storage:await ports.storage(ctx)},ctx.signal);
  // Re-read the actual session records before serving status outside a hook.
  journal.refresh = signal => refreshStorage({ signal });
  on("context", async (event,ctx) => {
    await refreshStorage(ctx);
    return { messages: restoreTaskToolOrder(event.messages) };
  });
  on("turn_start", () => {
    providerTurnOpen = true;
  });
  on("turn_end", () => {
    providerTurnOpen = false;
    if (pendingStatus !== null) send(pendingStatus.content, pendingStatus.command);
  });
  on("tool_call", async (event,ctx) => {
    providerTurnOpen = true;
    await refreshStorage(ctx);
    if (halted && event.toolName !== "task_status")
      return {
        block: true,
        reason: "Task selection/recovery is required. Return the saved task status; do not perform queued effects."
      };
    try {
      return await journal.guard(event) || void 0;
    } catch (e) {
      return { block: true, reason: clean(e.message) };
    }
  });
  on("tool_result", async (event, ctx) => {
    await journal.observe(event, ctx.cwd);
    if (event.toolName === "read" && !event.isError)
      await evidence.capture(event, ctx.cwd, await bindingKey());
    if (toolResultFailed(event)) {
      const context2 = failureContext(journal.snapshot(), failureObservation(event, (/* @__PURE__ */ new Date()).toISOString()));
      return { content: [...event.content || [], { type: "text", text: context2 }] };
    }
  });
  onEvent("drone:context-evicted", async (event) => {
    if (event.sessionId === activeSessionId) await evidence.evict(event.toolCallIds);
  });
  on("agent_end", async (event, ctx) => {
    const turnContext = context;
    const turnSessionId = activeSessionId;
    if (!turnContext || !turnSessionId || turnSessionId !== (ctx?.sessionManager?.getSessionId?.() || ctx?.sessionId))
      return;
    const last = [...event.messages || []].reverse().find((m) => m.role === "assistant");
    providerTurnOpen = false;
    const held = pendingStatus;
    pendingStatus = null;
    if (held) send(held.content, held.command);
    if (last?.stopReason === "aborted" || ctx?.signal?.aborted || /was aborted|request aborted/i.test(last?.errorMessage || "")) {
      cancelHandoff();
      await journal.pause("user-aborted");
      send();
      return;
    }
    await journal.settle();
    if (journal.authorization()) {
      await journal.reconcile(turnContext.cwd);
      if (last?.knowledgePublication?.status === "blocked" && last.stopReason !== "error" && await journal.reserveContinuation(last.knowledgePublication.reason)) {
        send("\u521A\u624D\u505C\u4E86\u4E00\u4E0B\uFF0C\u6B63\u5728\u6309\u4F60\u4E4B\u524D\u7684\u6388\u6743\u63A5\u7740\u505A\uFF1A\u5148\u6838\u5BF9\u5DF2\u6709\u7ED3\u679C\uFF0C\u518D\u7EE7\u7EED\u5269\u4E0B\u7684\u90E8\u5206\uFF0C\u4E0D\u7528\u4F60\u518D\u786E\u8BA4\u3002");
        if (activeSessionId !== turnSessionId || context !== turnContext) return;
        await continueAuthorized(turnContext);
        return;
      }
      if (last?.stopReason !== "error" && !ctx?.signal?.aborted && await journal.reserveHandoff()) {
        send();
        if (activeSessionId !== turnSessionId || context !== turnContext) return;
        await continueAuthorized(turnContext);
        return;
      }
      const snapshot = journal.snapshot();
      if (last?.stopReason !== "error" && !ctx?.signal?.aborted && shouldAskToContinue(snapshot ? journal.view().tasks.find((t) => t.id === snapshot.id) : null)) {
        send();
        try {
          if (activeSessionId !== turnSessionId || context !== turnContext) return;
          await progressTask({ taskId: snapshot.id, revision: journal.view().revision }, turnContext);
        } catch {
        }
        return;
      }
    }
    send();
  });
  const tool = (name, description, properties, required, execute) => pi.registerTool({
    name,
    label: name,
    description,
    parameters: { type: "object", properties, required, additionalProperties: false },
    execute: bindCallback(async (_id, input, _signal, _update, ctx) => {
      await attach(ctx);
      const result = await execute(input, ctx, _signal);
      return {
        content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }],
        details: { operational: true }
      };
    }, 4)
  });
  const str = { type: "string", minLength: 1, maxLength: 512 };
  tool(
    "task_status",
    "Host task ledger for any scientific workflow. No model/evidence certification. Query before repeating uncertain effects.",
    {},
    [],
    async (_input, ctx) => {
      const notice = "\n本次只返回已保存的观察；需要重新核对已有文件时请明确调用 task_reconcile。";
      return `${journal.render()}${notice}${taskProgressContext(journal.snapshot())}`;
    }
  );
  tool(
    "task_plan",
    "Prepare one task authorization per contract after read-only discovery: original goal, understandable scope, existing write directories, and immutable deliverables. Bundle necessary choices here instead of asking about each step. Call task_plan again only for a separate goal; that opens a new task and preserves the previous checkpoint. The host opens ask_user automatically; only its explicit approval authorizes the shown task revision. The user authorizes once per task; normal stages and bounded recovery then proceed automatically. No authorization of new risks, arbitrary commands, credentials or scientific conclusions.",
    {
      goal: { ...str, maxLength: 180 },
      summary: { type: "string", minLength: 1, maxLength: 1200 },
      writeDirectories: { type: "array", maxItems: 8, items: str },
      compute: {
        type: "object",
        properties: {
          hosts: {
            type: "array",
            minItems: 1,
            maxItems: 32,
            items: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" }
          },
          remoteRead: { type: "array", maxItems: 64, items: { ...str, maxLength: 1024 } },
          remoteWrite: { type: "array", maxItems: 64, items: { ...str, maxLength: 1024 } },
          budget: {
            type: "object",
            properties: {
              maxCoreHours: { type: "number", minimum: 0, maximum: 1e9 },
              maxWalltimeMinutes: { type: "integer", minimum: 1, maximum: 2e6 },
              maxConcurrentJobs: { type: "integer", minimum: 1, maximum: 1e4 },
              maxDiskGb: { type: "integer", minimum: 1, maximum: 1e6 }
            },
            required: ["maxCoreHours", "maxWalltimeMinutes", "maxConcurrentJobs", "maxDiskGb"],
            additionalProperties: false
          },
          workflows: { type: "array", maxItems: 128, items: { ...str, maxLength: 256 } },
          agentCode: { type: "boolean" }
        },
        required: ["hosts", "remoteRead", "remoteWrite", "budget", "workflows"],
        additionalProperties: false
      },
      milestones: {
        type: "array",
        minItems: 1,
        maxItems: 24,
        items: {
          type: "object",
          properties: {
            id: str,
            title: str,
            dependsOn: { type: "array", maxItems: 24, items: str },
            // kind 枚举与扩展字段是活引用：后加载的扩展登记的验收种类也会出现在模型看到的 schema 里
            acceptance: acceptanceSchema()
          },
          required: ["id", "title", "acceptance"],
          additionalProperties: false
        }
      }
    },
    ["goal", "summary", "milestones"],
    async (input, ctx, signal) => {
      const writeRoots = await ports.writeRoots(ctx.cwd, input.writeDirectories || []);
      const result = await journal.plan({ ...input, writeRoots });
      send("\u8BA1\u5212\u5DF2\u7ECF\u51C6\u5907\u597D\uFF0C\u9A6C\u4E0A\u4F1A\u5F39\u51FA\u4E00\u4E2A\u786E\u8BA4\u6846\uFF0C\u540C\u610F\u540E\u5F00\u59CB\u6267\u884C\u3002");
      const authorized = await askAuthorization(
        { taskId: journal.snapshot().id, revision: journal.view().revision, action: "authorize-task" },
        ctx,
        signal
      );
      send(authorized ? "\u4F60\u5DF2\u786E\u8BA4\uFF0C\u5F00\u59CB\u6267\u884C\u8FD9\u4E2A\u4EFB\u52A1\u3002" : "\u4F60\u6CA1\u6709\u786E\u8BA4\uFF0C\u4EFB\u52A1\u5148\u505C\u5728\u539F\u5730\uFF0C\u4E0D\u4F1A\u6539\u52A8\u4EFB\u4F55\u6587\u4EF6\u3002");
      return {
        milestones: result,
        authorized,
        next: authorized ? "Continue within the approved scope." : "Stop and retain the checkpoint. Do not repeat the authorization question."
      };
    }
  );
  tool(
    "task_wait",
    "Create a tracked human download/file, permission, review or rebind action. Supply the requested identity (title/DOI/hash), not generic download instructions. kind=rebind asks the user to replace the DOI an approved milestone is verified against (milestoneId + doi + reason) when the planned or previously bound DOI turned out to be the wrong paper; the host opens the confirmation card and only the user's choice applies it. Cancellation is not consent; Wiki approval uses its existing review UI.",
    {
      kind: { type: "string", enum: ["file", "download", "authorization", "review", "rebind"] },
      title: str,
      reason: str,
      url: str,
      doi: str,
      sha256: str,
      milestoneId: str
    },
    ["kind", "title", "reason"],
    async (input, ctx, signal) => {
      const action = await journal.wait(input);
      if (!["authorization", "rebind"].includes(action.kind)) return action;
      const authorized = await askAuthorization(
        {
          taskId: journal.snapshot().id,
          revision: journal.view().revision,
          action: "ask-authorization",
          actionId: action.id
        },
        ctx,
        signal
      );
      send(
        authorized ? action.kind === "rebind" ? "\u5DF2\u6309\u4F60\u7684\u786E\u8BA4\u66F4\u6362\u8FD9\u4E00\u9879\u5BF9\u5E94\u7684\u6587\u732E\uFF0C\u63A5\u4E0B\u6765\u6309\u65B0 DOI \u6838\u5BF9\u3002" : "\u597D\u7684\uFF0C\u8FD9\u9879\u5DF2\u7ECF\u4F60\u786E\u8BA4\uFF0C\u7EE7\u7EED\u5F80\u4E0B\u505A\u3002" : "\u4F60\u6CA1\u6709\u786E\u8BA4\uFF0C\u8FD9\u9879\u5148\u7559\u7740\uFF0C\u4E0D\u4F1A\u66FF\u4F60\u505A\u51B3\u5B9A\u3002"
      );
      return { ...action, state: authorized ? "acknowledged" : "pending", authorized };
    }
  );
  tool(
    "task_reconcile",
    "Read-only revalidation of recorded workspace artifacts under CURRENT read permissions. Does not rerun commands, certify scientific conclusions or approve Wiki.",
    {},
    [],
    (_input, ctx) => journal.reconcile(ctx.cwd)
  );
  tool(
    "task_evidence_restore",
    "Recover a host-recorded, actually evicted file window only after current permission and version checks. At most two recoveries per task, bounded bytes. Does not mint scientific evidence receipts.",
    { receiptId: str, path: str },
    ["receiptId", "path"],
    (input, ctx) => evidence.restore(input, ctx.cwd, awaitBinding)
  );
  const awaitBinding = () => bindingKey();
  pi.registerCommand("task-status", {
    description: "\u4EFB\u52A1\u5DE5\u4F5C\u53F0\uFF1A\u65E0\u6A21\u578B\u72B6\u6001\u3001\u4EFB\u52A1\u9009\u62E9\u3001\u4EA7\u7269\u4E0E\u4EBA\u5DE5\u52A8\u4F5C",
    handler: bindCallback(async (_args, ctx) => {
      await attach(ctx);
      send(void 0, "task-status");
    })
  });
  const progressTask = createTaskProgression(journal, {
    getGeneration: () => handoffGeneration,
    askAuthorization,
    checkBinding: bindingKey,
    continueAuthorized,
    prepareRemaining: () => ports.sendUserMessage(currentContext(), "\u7EE7\u7EED", { expandPromptTemplates: false }),
    send,
    ui: ports,
  });
  pi.registerCommand("task-action", {
    description: "\u4EFB\u52A1\u9762\u677F\u7684\u7248\u672C\u5316\u7528\u6237\u64CD\u4F5C\uFF1B\u4E0D\u6388\u4E88\u65B0\u6743\u9650",
    handler: bindCallback(singleFlightCommand(async (args, ctx) => {
      cancelHandoff();
      await attach(ctx);
      if (!await ports.idle(ctx))
        throw new Error("Stop the agent before changing tasks or inspecting recovery files.");
      if (args.length > 6e3) throw new Error("Task command too large.");
      if (!args.trim()) {
        send("\u4EFB\u52A1\u52A8\u4F5C\u4E3A\u7A7A\uFF1A\u8BF7\u4ECE\u4EFB\u52A1\u9762\u677F\u53D1\u8D77\u5177\u4F53\u64CD\u4F5C\uFF1B\u8FD9\u6761\u6D88\u606F\u4E0D\u4F1A\u6539\u53D8\u4EFB\u52A1\u6216\u6388\u6743\u3002", "task-action");
        return;
      }
      const input = JSON.parse(Buffer.from(args.trim(), "base64url").toString("utf8"));
      if (input.action === "progress") {
        await progressTask(input, ctx);
        return;
      }
      if (input.action === "authorize-task") {
        if (!await askAuthorization(input, ctx)) {
          send("\u4F60\u6CA1\u6709\u786E\u8BA4\uFF0C\u4EFB\u52A1\u4E0D\u4F1A\u5F00\u59CB\u3002\u60F3\u6267\u884C\u7684\u65F6\u5019\u518D\u70B9\u4E00\u6B21\u5C31\u884C\u3002");
          return;
        }
        const authorizedTask = journal.view().tasks.find((task) => task.id === input.taskId);
        ports.decision?.({
          id: `task-authorization:${input.taskId}:${input.revision}`,
          kind: "task-authorization",
          summary: authorizedTask?.authorizationSummary || authorizedTask?.goal || "Task authorization approved",
          basis: [`task:${input.taskId}`, `revision:${input.revision}`],
          at: (/* @__PURE__ */ new Date()).toISOString()
        });
        send("\u5DF2\u786E\u8BA4\uFF0C\u63A5\u4E0B\u6765\u4F1A\u81EA\u52A8\u505A\u5B8C\u5E76\u4EA4\u4ED8\u7ED3\u679C\u3002\u4F60\u968F\u65F6\u53EF\u4EE5\u505C\uFF1B\u8981\u505A\u8BA1\u5212\u4E4B\u5916\u7684\u4E8B\u4ECD\u4F1A\u5148\u95EE\u4F60\u3002");
        await continueAuthorized(ctx);
        return;
      }
      if (["approve-plan", "next-stage", "ask-authorization", "confirm-outcome"].includes(input.action)) {
        const accepted = await askAuthorization(input, ctx);
        send(accepted ? "\u5DF2\u8BB0\u5F55\u4F60\u7684\u786E\u8BA4\u3002" : "\u4F60\u6CA1\u6709\u786E\u8BA4\uFF0C\u4E00\u5207\u4FDD\u6301\u539F\u6837\u3002");
        if (accepted) {
          await journal.command({ taskId: input.taskId, revision: journal.view().revision, action: "select" });
          await continueAuthorized(ctx);
        }
        return;
      }
      if (input.action === "acknowledge") {
        const action = journal.view().tasks.find((t) => t.id === input.taskId)?.actions.find((a) => a.id === input.actionId);
        if (["authorization", "rebind"].includes(action?.kind)) {
          const accepted = await askAuthorization({ ...input, action: "ask-authorization" }, ctx);
          send();
          if (accepted) {
            if (action?.kind === "rebind")
              ports.decision?.({
                id: `rebind:${input.taskId}:${input.actionId}`,
                kind: "rebind",
                summary: action.title || "Rebind approved",
                basis: [`task:${input.taskId}`, `action:${input.actionId}`],
                at: (/* @__PURE__ */ new Date()).toISOString()
              });
            await journal.command({ taskId: input.taskId, revision: journal.view().revision, action: "select" });
            await continueAuthorized(ctx);
          }
          return;
        }
      }
      if (input.action === "file") await journal.acceptFile(input, ctx.cwd);
      else if (input.action === "refresh") {
        await journal.command({ ...input, action: "select" });
        await journal.reconcile(ctx.cwd);
      } else if (input.action === "resume") {
        await journal.command({ ...input, action: "select" });
        const result = await journal.begin("\u7EE7\u7EED", [], await bindingKey());
        if (result.blocked || journal.snapshot()?.state === "blocked" || journal.snapshot()?.state === "waiting_user") {
          send();
          return;
        }
        send();
        await ports.sendUserMessage(ctx, "\u7EE7\u7EED", { expandPromptTemplates: true });
        return;
      } else await journal.command(input);
      send(void 0, "task-action");
    }))
  });
  return journal;
}
export {
  registerWorkbenchAdapter
};
