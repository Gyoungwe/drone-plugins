/** Internal engine port shared by the canonical Node and in-memory WASM adapters. */
export type InquirySqliteValue = string | number | null;
export interface InquirySqliteStatement {
	get(...parameters: InquirySqliteValue[]): unknown;
	all(...parameters: InquirySqliteValue[]): readonly unknown[];
	run(...parameters: InquirySqliteValue[]): void;
}
export interface InquirySqliteConnection {
	exec(sql: string): void;
	prepare(sql: string): InquirySqliteStatement;
	serialize(operation: () => Promise<void>): Promise<void>;
	close(): void;
}
