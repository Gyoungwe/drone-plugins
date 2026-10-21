/**
 * Package-local worker entry. The core worker is deliberately kept as a
 * separate resource so KnowledgeService can start it with worker_threads.
 */
import "../core/worker.js";
