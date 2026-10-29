import type { KnowledgeBinding } from "./config.js";
import type { ReadNoteResult } from "./files.js";

export interface WikiReviewStateDocument {
	value: unknown;
	version: string;
}
/** One owner's existing review records and granted Vault, never synthetic OS paths. */
export interface WikiReviewPorts {
	state: {
		read(path: string): Promise<WikiReviewStateDocument | null>;
		list(path: string): Promise<string[]>;
		write(path: string, value: unknown, expectedVersion: string | null): Promise<void>;
		remove(path: string, expectedVersion: string): Promise<void>;
	};
	files: {
		read(binding: KnowledgeBinding, path: string): Promise<ReadNoteResult | null>;
		write(
			binding: KnowledgeBinding,
			path: string,
			text: string,
			expectedHash: string | null,
			check: () => Promise<void>,
		): Promise<void>;
		remove(
			binding: KnowledgeBinding,
			path: string,
			expectedHash: string,
			check: () => Promise<void>,
		): Promise<void>;
	};
}
