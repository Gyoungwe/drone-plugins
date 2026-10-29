import type { ReadNoteResult } from "./files.js";

export interface KnowledgeIndexFiles {
	inspect(path: string): Promise<{ signature: string }>;
	read(path: string): Promise<ReadNoteResult>;
	list(path: string): Promise<Array<{ name: string; kind: "file" | "directory" | "symlink" | "other" }>>;
	watch: ((change: (path: string | null) => void, error: (error: Error) => void) => Promise<{ close(): void }>) | null;
}
export interface KnowledgeIndexTransport {
	onMessage(handler: (message: { id: number; op: string; args?: Record<string, unknown> }) => Promise<void>): void;
	send(message: object): void;
	close(): void;
}
