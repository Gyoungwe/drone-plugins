/** Native worker_threads adapter; the index algorithm is runtime-independent. */
import { parentPort, workerData } from "node:worker_threads";
import { createKnowledgeIndexRuntime } from "./index-runtime.js";
import { createLocalKnowledgeIndexFiles } from "./index-runtime-local.js";

await createKnowledgeIndexRuntime(workerData, createLocalKnowledgeIndexFiles(workerData.vault), {
 onMessage: handler => { parentPort!.on("message", handler); },
 send: message => parentPort!.postMessage(message),
 close: () => parentPort!.close(),
});
