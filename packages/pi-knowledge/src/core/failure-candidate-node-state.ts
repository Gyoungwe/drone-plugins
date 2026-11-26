import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { FAILURE_CANDIDATE_LIMITS } from "./failure-candidate-contract.js";
import {
	CORRUPT_FAILURE_CANDIDATE_DOCUMENT,
	serializeFailureCandidateDocument,
	sha256,
} from "./failure-candidate-sanitize.js";
import type { FailureCandidateState } from "./failure-candidate-store.js";

async function checkDirectory(path: string, create: boolean, recursive = false): Promise<boolean> {
	if (create) {
		try {
			await mkdir(path, { recursive, mode: 0o700 });
		} catch (error) {
			if ((error as NodeJS.ErrnoException | null)?.code !== "EEXIST") throw error;
		}
	}
	try {
		if (!(await lstat(path)).isDirectory()) throw new Error(CORRUPT_FAILURE_CANDIDATE_DOCUMENT);
		return true;
	} catch (error) {
		if (!create && (error as NodeJS.ErrnoException | null)?.code === "ENOENT") return false;
		throw error;
	}
}

async function checkParents(directory: string, path: string, create: boolean): Promise<boolean> {
	if (!(await checkDirectory(directory, create, true))) return false;
	let parent = directory;
	for (const segment of path.split("/").slice(0, -1)) {
		parent = join(parent, segment);
		if (!(await checkDirectory(parent, create))) return false;
	}
	return true;
}

async function readBytes(path: string): Promise<Buffer> {
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const stat = await file.stat();
		const { maxFileBytes } = FAILURE_CANDIDATE_LIMITS;
		if (!stat.isFile() || stat.size > maxFileBytes) throw new Error(CORRUPT_FAILURE_CANDIDATE_DOCUMENT);
		const buffer = Buffer.alloc(maxFileBytes + 1);
		let read = 0;
		while (read < buffer.length) {
			const { bytesRead } = await file.read(buffer, read, buffer.length - read);
			if (bytesRead === 0) break;
			read += bytesRead;
		}
		if (read > maxFileBytes) throw new Error(CORRUPT_FAILURE_CANDIDATE_DOCUMENT);
		return buffer.subarray(0, read);
	} finally {
		await file.close();
	}
}

export function createNativeFailureCandidateState(directory: string): FailureCandidateState {
	async function read(path: string) {
		if (!(await checkParents(directory, path, false))) return null;
		let bytes: Buffer;
		try {
			const target = join(directory, path);
			if (!(await lstat(target)).isFile()) throw new Error(CORRUPT_FAILURE_CANDIDATE_DOCUMENT);
			bytes = await readBytes(target);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException | null)?.code;
			if (code === "ENOENT") return null;
			if (code === "ELOOP") throw new Error(CORRUPT_FAILURE_CANDIDATE_DOCUMENT);
			throw error;
		}
		try {
			const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
			return { value, version: sha256(bytes) };
		} catch {
			throw new Error(CORRUPT_FAILURE_CANDIDATE_DOCUMENT);
		}
	}
	return {
		read,
		async write(path, value, expectedVersion) {
			await checkParents(directory, path, true);
			const target = join(directory, path);
			const temporary = `${target}.${randomUUID()}.tmp`;
			const serialized = serializeFailureCandidateDocument(value);
			const file = await open(temporary, "wx", 0o600);
			try {
				try {
					await file.writeFile(serialized);
				} finally {
					await file.close();
				}
				if (((await read(path))?.version ?? null) !== expectedVersion)
					throw Object.assign(new Error("Failure-candidate state version conflict"), {
						code: "ESTATECONFLICT",
					});
				await rename(temporary, target);
			} catch (error) {
				await unlink(temporary);
				throw error;
			}
			if ((await read(path))?.version !== sha256(serialized))
				throw new Error("Failure-candidate write could not be read back");
		},
	};
}
