/** Adapter-independent view of the single canonical TaskSession.
 * Signals are read for each invocation; no SDK context or captured UI state is
 * reconstructed here. Callers await the same actor operations.
 */
export function createTaskController(session, readSignal) {
  const journal = {
    scope: () => session.status().scope,
    view: () => session.status().view,
    snapshot: () => session.status().snapshot,
    render: () => session.status().render,
    readRoots: () => session.status().readRoots,
    authorization: forWrite => session.status()[forWrite ? "writeAuthorization" : "authorization"],
    begin: (query, capabilities = [], binding = null) => session.input({query,capabilities,binding}, readSignal()),
    plan: input => session.action({kind:"plan",input},readSignal()),
    wait: input => session.action({kind:"wait",input},readSignal()),
    command: input => session.action({kind:"command",input},readSignal()),
    acceptFile: (input,cwd) => session.action({kind:"file",input,cwd},readSignal()),
    reconcile: cwd => session.action({kind:"reconcile",cwd},readSignal()),
    guard: value => session.observe({kind:"call",value},readSignal()),
    observe: (value,cwd) => session.observe({kind:"result",value,cwd},readSignal()),
    pause: reason => session.turn({kind:"pause",reason}),
    settle: () => session.turn({kind:"settle"},readSignal()),
    reserveContinuation: reason => session.turn({kind:"reserve-continuation",reason},readSignal()),
    reserveHandoff: () => session.turn({kind:"reserve-handoff"},readSignal()),
    advanceStage: () => session.turn({kind:"advance-stage"},readSignal()),
    requestReport: () => session.turn({kind:"request-report"},readSignal()),
    takeReport: () => session.turn({kind:"take-report"},readSignal()),
  };
  const evidence = {
    capture: (value,cwd,binding) => session.observe({kind:"capture",value,cwd,binding},readSignal()),
    evict: ids => session.observe({kind:"evicted",ids},readSignal()),
    restore: (input,cwd,binding) => session.action({kind:"evidence-restore",input,cwd,binding},readSignal()),
  };
  return { journal, evidence };
}
