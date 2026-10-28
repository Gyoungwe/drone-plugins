import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import type {
	InquirySqliteConnection,
	InquirySqliteStatement,
} from "./sqlite-connection.js";
import {
	CanonicalSqliteInquiryStorage,
	configureInquirySqlite,
	readInquirySqliteMetadata,
} from "./sqlite-storage.js";

class WasmConnection implements InquirySqliteConnection {
	private pending = Promise.resolve();
	constructor(readonly database: Database) {}
	exec(sql: string): void {
		this.database.run(sql);
	}
	prepare(sql: string): InquirySqliteStatement {
		// Statements are created and freed per use, so no native/WASM statement survives a transaction.
		return {
			get: (...parameters) => {
				const statement = this.database.prepare(sql);
				try {
					statement.bind(parameters);
					return statement.step() ? statement.getAsObject() : undefined;
				} finally {
					statement.free();
				}
			},
			all: (...parameters) => {
				const statement = this.database.prepare(sql);
				try {
					statement.bind(parameters);
					const rows = [];
					while (statement.step()) rows.push(statement.getAsObject());
					return rows;
				} finally {
					statement.free();
				}
			},
			run: (...parameters) => {
				this.database.run(sql, parameters);
			},
		};
	}
	serialize(operation: () => Promise<void>): Promise<void> {
		const pending = this.pending.then(operation);
		// Return the original failure; a later explicit transaction may follow a successful SQL rollback.
		this.pending = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	}
	close(): void {
		this.database.close();
	}
}

/** In-memory SQLite; file placement, authorization and CAS belong to the owning runtime's host ports. */
export class WasmInquiryStorage extends CanonicalSqliteInquiryStorage {
	constructor(
		projectId: string,
		private readonly connection: WasmConnection,
	) {
		super(projectId, connection);
	}
	async exportBytes(): Promise<Uint8Array> {
		let bytes!: Uint8Array;
		await this.connection.serialize(async () => {
			bytes = this.connection.database.export();
			// sql.js export reopens the connection; restore the same canonical engine settings.
			configureInquirySqlite(this.connection);
		});
		return bytes;
	}
	override async close(): Promise<void> {
		await this.connection.serialize(() => super.close());
	}
}

/** One initialized engine belongs to the caller's application owner; no process-global domain ledger. */
export async function createInquiryWasmEngine(wasmBinary: Uint8Array): Promise<{
	open(projectId: string, bytes?: Uint8Array): WasmInquiryStorage;
	inspect(bytes: Uint8Array): {
		projectId: string;
		schemaVersion: number;
		revision: number;
	};
}> {
	const SQL: SqlJsStatic = await initSqlJs({
		wasmBinary: new Uint8Array(wasmBinary).buffer,
	});
	return {
		inspect(bytes) {
			const connection = new WasmConnection(new SQL.Database(bytes));
			try {
				const meta = readInquirySqliteMetadata(connection);
				return {
					projectId: meta.project_id,
					schemaVersion: meta.schema_version,
					revision: meta.revision,
				};
			} finally {
				connection.close();
			}
		},
		open(projectId, bytes) {
			if (!projectId.trim())
				throw new Error("Inquiry projectId cannot be empty");
			return new WasmInquiryStorage(
				projectId,
				new WasmConnection(new SQL.Database(bytes)),
			);
		},
	};
}
