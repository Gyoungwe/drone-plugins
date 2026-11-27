import type { InquiryCompatiblePort, InquiryDiscoveryPort } from "../../src/domain/index.js";
import type {
	DiscoveryAttemptRecord,
	DiscoveryFindingRecord,
	DiscoveryQuestionRecord,
} from "../../src/ports.js";

type InquiryWrite =
	| { kind: "question"; record: DiscoveryQuestionRecord }
	| { kind: "attempt"; record: DiscoveryAttemptRecord }
	| { kind: "finding"; record: DiscoveryFindingRecord };

export class MemoryInquiryPort implements InquiryCompatiblePort, InquiryDiscoveryPort {
	readonly writes: InquiryWrite[] = [];

	constructor(readonly projectId: string) {}

	async recordQuestion(record: DiscoveryQuestionRecord): Promise<void> {
		this.writes.push({ kind: "question", record });
	}

	async recordAttempt(record: DiscoveryAttemptRecord): Promise<void> {
		this.writes.push({ kind: "attempt", record });
	}

	async recordFinding(record: DiscoveryFindingRecord): Promise<void> {
		this.writes.push({ kind: "finding", record });
	}
}
