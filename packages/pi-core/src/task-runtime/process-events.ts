import type { EventEmitter } from "node:events";

function emitProcessEvent(event: string | symbol, ...args: unknown[]) {
	(process as EventEmitter).emit(event, ...args);
}

export { emitProcessEvent };
