import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	fstatSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export interface KnowledgeWriterLease {
	release(): void;
}

export interface KnowledgeWriterLeaseInput {
	vault: string;
	indexPath: string;
}

function canonicalIndex(path: string): string {
	try {
		return realpathSync(path);
	} catch (error) {
		// A first writer has no SQLite file yet; its parent must already exist.
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return join(realpathSync(dirname(path)), basename(path));
	}
}

function acquireFile(path: string): KnowledgeWriterLease {
	let fd: number;
	try {
		fd = openSync(path, "wx", 0o600);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		throw new Error(
			`Knowledge writer is already reserved: ${path}. Stale leases require explicit recovery.`,
			{
				cause: error,
			},
		);
	}
	const owner = `${randomUUID()}\n${process.pid}\n`;
	const identity = fstatSync(fd);
	try {
		writeFileSync(fd, owner, "utf8");
	} catch (error) {
		// Initialization has not published a lease; remove only our newly-created file.
		unlinkSync(path);
		throw error;
	} finally {
		closeSync(fd);
	}
	let released = false;
	return {
		release() {
			if (released) return;
			const current = lstatSync(path);
			if (
				!current.isFile() ||
				current.dev !== identity.dev ||
				current.ino !== identity.ino ||
				readFileSync(path, "utf8") !== owner
			) {
				throw new Error(`Knowledge writer lease ownership changed: ${path}`);
			}
			unlinkSync(path);
			released = true;
		},
	};
}

/**
 * One local OS user shares these leases across CLI/Desktop and module copies.
 * Neither a live second writer nor an unverified crash residue is taken over.
 * The directory parameter is a resource-port seam for isolated tests/brokers;
 * production local adapters use the fixed user location, never per-workspace roots.
 */
export function acquireKnowledgeWriterLease(
	input: KnowledgeWriterLeaseInput,
	leaseDirectory = join(
		homedir(),
		".drone",
		"runtime-leases",
		"knowledge-writers",
	),
): KnowledgeWriterLease {
	const resources = [
		`vault:${realpathSync(input.vault)}`,
		`index:${canonicalIndex(input.indexPath)}`,
	];
	mkdirSync(leaseDirectory, { recursive: true, mode: 0o700 });
	const locks: KnowledgeWriterLease[] = [];
	const release = () => {
		const failures: unknown[] = [];
		for (const lock of locks) {
			try {
				lock.release();
			} catch (error) {
				// Release the other resource too, but never claim successful cleanup.
				failures.push(error);
			}
		}
		if (failures.length)
			throw new AggregateError(
				failures,
				"Knowledge writer lease release failed",
			);
	};
	try {
		for (const resource of resources) {
			const key = createHash("sha256").update(resource).digest("hex");
			locks.push(acquireFile(join(leaseDirectory, `${key}.lock`)));
		}
	} catch (error) {
		release();
		throw error;
	}
	return { release };
}
