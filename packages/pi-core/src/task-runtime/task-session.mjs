import { createEvidenceRecovery } from "./evidence.mjs";
import { createTaskWorkbench, WORKBENCH_ENTRY } from "./workbench.mjs";

export const TASK_SESSION_ENTRY = "drone-task-session-v1";
const EVIDENCE_ENTRY = "drone-task-evidence-v1";

// pi-core 0.2 migrates the v2 workbench/v1 evidence records into one SDK append.
// Remove the old record reader only after supported histories have been saved in
// the task-session v1 format; there is no second writer or state machine.
function taskEntries(entries) {
  return entries.flatMap((entry) =>
    entry.customType === TASK_SESSION_ENTRY && entry.data?.version === 1
      ? [
          { customType: WORKBENCH_ENTRY, data: entry.data.workbench },
          { customType: EVIDENCE_ENTRY, data: entry.data.evidence },
        ]
      : [entry],
  );
}

/** One serial task module. Reads expose only the last committed state. */
export function createTaskSession({
  persist,
  inspect,
  authorize,
  readOnly,
  onCommitted,
  readFailure,
  onPersistenceFailed,
}) {
  const lifetime = new AbortController();
  let tail = Promise.resolve(),
    closed = false,
    dirty = false,
    checkpointRequested = false,
    records = [];
  const journal = createTaskWorkbench({
    requireAuthorization: true,
    readOnly,
    inspect,
    persist: () => {
      dirty = true;
    },
    onCheckpoint: () => {
      checkpointRequested = true;
    },
  });
  const evidence = createEvidenceRecovery({
    authorize,
    persist: () => {
      dirty = true;
    },
  });
  const projection = () => ({
    scope: journal.scope(),
    view: journal.view(),
    snapshot: journal.snapshot(),
    render: journal.render(),
    readRoots: journal.readRoots(),
    authorization: journal.authorization(),
    writeAuthorization: journal.authorization(true),
  });
  let committed = projection(),
    persistenceFailure;
  const failure = () => persistenceFailure || readFailure();
  const execute = (signal, operation) => {
    const previous = tail;
    let release;
    tail = new Promise((resolve) => {
      release = resolve;
    });
    const combined = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
    return (async () => {
      await previous;
      let before,
        beforeEvidence,
        beforeRecords,
        saved = false;
      try {
        if (closed) throw new Error("Task session is closed");
        if (failure())
          throw new Error(
            "Task storage failed; reopen the application from disk before changing this session. " +
              failure().message,
          );
        combined.throwIfAborted();
        before = journal.checkpoint();
        beforeEvidence = evidence.checkpoint();
        beforeRecords = records;
        dirty = false;
        checkpointRequested = false;
        const result = await operation(journal, evidence, combined);
        evidence.attach(journal.scope(), journal.snapshot()?.id, records);
        combined.throwIfAborted();
        if (dirty) {
          try {
            await persist(
              {
                customType: TASK_SESSION_ENTRY,
                data: {
                  version: 1,
                  workbench: journal.checkpoint().book,
                  evidence: evidence.checkpoint(),
                },
              },
              combined,
            );
          } catch (error) {
            persistenceFailure = {
              state: "needs-reopen",
              message: error.message,
              lastCommitted: structuredClone(committed),
            };
            onPersistenceFailed(persistenceFailure);
            throw error;
          }
        }
        committed = projection();
        saved = true;
        combined.throwIfAborted();
        if (checkpointRequested) await onCommitted(committed);
        return result;
      } catch (error) {
        if (!saved && before) {
          journal.rollback(before);
          evidence.rollback(beforeEvidence);
          records = beforeRecords;
        }
        throw error;
      } finally {
        release();
      }
    })();
  };
  const status = () => {
    if (closed) throw new Error("Task session is closed");
    const result = structuredClone(failure()?.lastCommitted || committed);
    if (failure()) {
      result.persistence = { state: failure().state, message: failure().message };
      result.render +=
        "\nTask storage failed. This is the last committed task state; reopen the application from disk before continuing.";
    }
    return result;
  };
  return {
    status,
    input: ({ query, capabilities, binding }, signal) =>
      execute(signal, (journal) => journal.begin(query, capabilities, binding)),
    turn: (event, signal) =>
      execute(signal, (journal, evidence) => {
        switch (event.kind) {
          case "attach": {
            records = taskEntries(event.entries);
            journal.attach(event.scope, records, event.force);
            evidence.attach(event.scope, journal.snapshot()?.id, records, event.force);
            return;
          }
          case "pause":
            return journal.pause(event.reason);
          case "settle":
            return journal.settle();
          case "reserve-continuation":
            return journal.reserveContinuation(event.reason);
          case "reserve-handoff":
            return journal.reserveHandoff();
          case "advance-stage":
            return journal.advanceStage();
          case "request-report":
            return journal.requestReport();
          case "take-report":
            return journal.takeReport();
          default:
            throw new Error("Unknown task turn: " + event.kind);
        }
      }),
    observe: (event, signal) =>
      execute(signal, async (journal, evidence) => {
        if (event.kind === "call") return journal.guard(event.value);
        if (event.kind === "result") return journal.observe(event.value, event.cwd);
        if (event.kind === "capture")
          return evidence.capture(event.value, event.cwd, event.binding);
        if (event.kind === "evicted") return evidence.evict(event.ids);
        throw new Error("Unknown task observation: " + event.kind);
      }),
    action: (event, signal) =>
      execute(signal, (journal, evidence) => {
        switch (event.kind) {
          case "plan":
            return journal.plan(event.input);
          case "wait":
            return journal.wait(event.input);
          case "command":
            return journal.command(event.input);
          case "file":
            return journal.acceptFile(event.input, event.cwd);
          case "reconcile":
            return journal.reconcile(event.cwd);
          case "evidence-restore":
            return evidence.restore(event.input, event.cwd, event.binding);
          default:
            throw new Error("Unknown task action: " + event.kind);
        }
      }),
    close: () => {
      closed = true;
      lifetime.abort(new Error("Task session closed"));
      return tail;
    },
  };
}
