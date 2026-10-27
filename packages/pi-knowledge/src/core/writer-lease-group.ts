import type { KnowledgeWriterLease, KnowledgeWriterLeaseInput } from "./writer-lease.js";

/** Keep the writer reservation for the domain owner, not merely one live worker. */
export function createKnowledgeWriterLeaseGroup(acquire: (input: KnowledgeWriterLeaseInput) => KnowledgeWriterLease) {
	const reservations = new Map<string, { lease: KnowledgeWriterLease; workers: number }>();
	let disposed = false;
	function acquireWorker(input: KnowledgeWriterLeaseInput): KnowledgeWriterLease {
		if (disposed) throw new Error("Knowledge writer resource group has been disposed");
		const key = JSON.stringify([input.vault, input.indexPath]);
		let reservation = reservations.get(key);
		if (!reservation) {
			reservation = { lease: acquire(input), workers: 0 };
			reservations.set(key, reservation);
		}
		reservation.workers++;
		let released = false;
		return {
			release() {
				if (released) return;
				released = true;
				reservation.workers--;
			},
		};
	}
	function dispose(): void {
		disposed = true;
		const failures: unknown[] = [];
		for (const [key, reservation] of reservations) {
			if (reservation.workers !== 0) {
				failures.push(new Error("Knowledge writer still has a live worker; reservation retained"));
				continue;
			}
			try {
				reservation.lease.release();
				reservations.delete(key);
			} catch (error) {
				// Try all independent reservations, preserving every failed lease.
				failures.push(error);
			}
		}
		if (failures.length) throw new AggregateError(failures, "Knowledge writer reservations could not be released");
	}
	return { acquireWorker, dispose };
}
