import type { PluginHostEvent, PluginHostEventSource } from "@gyoungwe/plugin-api/host-events";
import { Parse } from "typebox/value";
import {
	type InquiryComputeEvent,
	type InquiryDecisionEvent,
	InquiryEventProjector,
	type InquiryLocalExecutionEvent,
	type InquiryTaskTerminalEvent,
} from "./event-projection.js";
import {
	computeEventSchema,
	decisionEventSchema,
	localExecutionEventSchema,
	taskTerminalEventSchema,
} from "./event-schema.js";
import type { InquiryLedgerOwner } from "./ledger-owner.js";

export const HOST_EVENT_TOPICS = [
	"inquiry.compute",
	"inquiry.task-terminal",
	"inquiry.local-execution",
	"inquiry.decision",
] as const;

const MAX_PENDING = 256;
const MAX_BYTES = 1024 * 1024;
const artifactFields =
	"id path bytes size sha256 location purpose status parentIds runId sourceKind sourceId".split(" ");
const fieldsByTopic = {
	"inquiry.compute":
		"id projectId sessionId turn codeFingerprint parameters runProvenance artifacts jobId type at status cursor detail runId startedAt hostId manifest".split(
			" ",
		),
	"inquiry.task-terminal":
		"id projectId sessionId turn codeFingerprint parameters runProvenance artifacts taskId runId status at startedAt detail manifest".split(
			" ",
		),
	"inquiry.local-execution":
		"id projectId sessionId turn codeFingerprint parameters runProvenance artifacts toolName startedAt finishedAt outcome".split(
			" ",
		),
	"inquiry.decision": ["id", "projectId", "kind", "summary", "basis", "affectedArtifactIds", "at"],
} satisfies Record<(typeof HOST_EVENT_TOPICS)[number], readonly string[]>;

type BufferedPayload =
	| { topic: "inquiry.compute"; projectId: string; payload: InquiryComputeEvent }
	| { topic: "inquiry.task-terminal"; projectId: string; payload: InquiryTaskTerminalEvent }
	| { topic: "inquiry.local-execution"; projectId: string; payload: InquiryLocalExecutionEvent }
	| { topic: "inquiry.decision"; projectId: string; payload: InquiryDecisionEvent };
type BufferedEvent = BufferedPayload & { readonly sequence: number; readonly bytes: number };
interface DrainResult {
	readonly drained: number;
	readonly remaining: number;
	readonly lastSequence: number | null;
	readonly overflowed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pick(value: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
	const selected: Record<string, unknown> = {};
	for (const field of fields) if (Object.hasOwn(value, field)) selected[field] = value[field];
	return selected;
}

function sanitizeArtifacts(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	return value.map((entry) => (isRecord(entry) ? pick(entry, artifactFields) : entry));
}

function sanitizePayload(topic: (typeof HOST_EVENT_TOPICS)[number], value: unknown): BufferedPayload {
	if (!isRecord(value)) throw new Error("host event payload must be an object");
	const payload = pick(value, fieldsByTopic[topic]);
	if (Object.hasOwn(payload, "artifacts")) payload.artifacts = sanitizeArtifacts(payload.artifacts);
	if (isRecord(payload.manifest)) {
		const manifest = pick(payload.manifest, ["entries"]);
		if (Object.hasOwn(manifest, "entries")) manifest.entries = sanitizeArtifacts(manifest.entries);
		payload.manifest = manifest;
	}
	if (typeof payload.projectId !== "string" || !payload.projectId.trim())
		throw new Error("host event projectId is required");
	const projectId = payload.projectId;
	switch (topic) {
		case "inquiry.compute":
			return { topic, projectId, payload: Parse(computeEventSchema, payload) };
		case "inquiry.task-terminal":
			return { topic, projectId, payload: Parse(taskTerminalEventSchema, payload) };
		case "inquiry.local-execution":
			return { topic, projectId, payload: Parse(localExecutionEventSchema, payload) };
		case "inquiry.decision":
			return { topic, projectId, payload: Parse(decisionEventSchema, payload) };
	}
}

export function normalizeProjectId(value: string | undefined): string {
	const trimmed = (value ?? "").trim();
	return trimmed === "/" ? trimmed : trimmed.replace(/[\\/]+$/u, "");
}

export class InquiryHostEventBuffer {
	private readonly pending: BufferedEvent[] = [];
	private readonly committed = new Set<number>();
	private readonly unsubscribe: Array<() => void> = [];
	private readonly unsubscribeFailures: unknown[] = [];
	private readonly abortListener = () => this.stop();
	private pendingBytes = 0;
	private malformed = 0;
	private overflowedValue = false;
	private stopped = false;

	constructor(
		private readonly source: PluginHostEventSource | undefined,
		private readonly signal: AbortSignal,
		private readonly changed: () => void,
	) {
		if (!source) return;
		try {
			for (const topic of HOST_EVENT_TOPICS)
				this.unsubscribe.push(source.subscribe(topic, (event) => this.receive(topic, event)));
		} catch (error) {
			this.stop();
			throw error;
		}
		signal.addEventListener("abort", this.abortListener, { once: true });
		if (signal.aborted) this.stop();
	}

	get subscribed(): boolean {
		return this.source !== undefined && !this.stopped && this.unsubscribe.length === HOST_EVENT_TOPICS.length;
	}

	diagnostics(projectId: string | undefined) {
		return {
			subscribed: this.subscribed,
			pending: projectId
				? this.pending.filter(
						(entry) => normalizeProjectId(entry.projectId) === normalizeProjectId(projectId),
					).length
				: 0,
			overflowed: this.overflowedValue,
			droppedMalformed: this.malformed,
		};
	}

	private receive(topic: (typeof HOST_EVENT_TOPICS)[number], event: PluginHostEvent): void {
		try {
			this.accept(topic, event);
		} catch {
			this.malformed++;
		}
	}

	private accept(topic: (typeof HOST_EVENT_TOPICS)[number], event: PluginHostEvent): void {
		if (this.stopped || this.signal.aborted) return;
		if (event.topic !== topic || !Number.isSafeInteger(event.sequence) || event.sequence <= 0)
			throw new Error("invalid host event sequence or topic");
		if (this.committed.has(event.sequence) || this.pending.some((entry) => entry.sequence === event.sequence))
			return;
		const parsed = sanitizePayload(topic, event.payload);
		if (this.overflowedValue) return;
		const serialized = JSON.stringify({ topic, sequence: event.sequence, payload: parsed.payload });
		if (serialized === undefined) throw new Error("host event could not be serialized");
		const bytes = Buffer.byteLength(serialized, "utf8");
		if (this.pending.length >= MAX_PENDING || this.pendingBytes + bytes > MAX_BYTES) {
			this.overflowedValue = true;
			return;
		}
		this.pending.push({ ...parsed, sequence: event.sequence, bytes });
		this.pendingBytes += bytes;
		if (!this.stopped && !this.signal.aborted) this.changed();
	}

	async drain(owner: InquiryLedgerOwner, signal: AbortSignal): Promise<DrainResult> {
		if (!this.source)
			return {
				drained: 0,
				remaining: this.pending.length,
				lastSequence: null,
				overflowed: this.overflowedValue,
			};
		let selected: BufferedEvent[] = [];
		await owner.write(
			"drainHostEvents",
			async (service) => {
				selected = this.pending
					.filter(
						(entry) => normalizeProjectId(entry.projectId) === normalizeProjectId(service.storage.projectId),
					)
					.sort((left, right) => left.sequence - right.sequence);
				for (const entry of selected) {
					const projector = new InquiryEventProjector(service.storage, service, (value) =>
						normalizeProjectId(value),
					);
					switch (entry.topic) {
						case "inquiry.compute":
							await projector.recordComputeEvent(entry.payload);
							break;
						case "inquiry.task-terminal":
							await projector.recordTaskTerminal(entry.payload);
							break;
						case "inquiry.local-execution":
							await projector.recordLocalExecution(entry.payload);
							break;
						case "inquiry.decision":
							await projector.recordDecision(entry.payload);
							break;
					}
				}
			},
			signal,
		);
		const drainedSequences = new Set(selected.map((entry) => entry.sequence));
		this.pending.splice(
			0,
			this.pending.length,
			...this.pending.filter((entry) => !drainedSequences.has(entry.sequence)),
		);
		this.pendingBytes -= selected.reduce((total, entry) => total + entry.bytes, 0);
		for (const entry of selected) this.committed.add(entry.sequence);
		return {
			drained: selected.length,
			remaining: this.pending.length,
			lastSequence: selected[selected.length - 1]?.sequence ?? null,
			overflowed: this.overflowedValue,
		};
	}

	private stop(): void {
		if (this.stopped) return;
		this.stopped = true;
		this.signal.removeEventListener("abort", this.abortListener);
		for (const unsubscribe of this.unsubscribe.splice(0)) {
			try {
				unsubscribe();
			} catch (error) {
				this.unsubscribeFailures.push(error);
			}
		}
	}

	dispose(): void {
		this.stop();
		if (this.unsubscribeFailures.length)
			throw new AggregateError(this.unsubscribeFailures, "Inquiry host event listeners could not be removed");
	}
}
