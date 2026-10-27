import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { KnowledgeConfigApi } from "./config.js";
import { readNoteFile } from "./files.js";
import { containedVaultFile } from "./layout.js";
import type { WikiReviewPorts } from "./wiki-review-ports.js";

const digest = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
const RENAME_RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
/** Windows editors/indexers can temporarily lock the atomic replacement target. */
export async function renameWithRetry(
	from: string,
	to: string,
	options: { attempts?: number; delayMs?: number; renameImpl?: (a: string, b: string) => Promise<void> } = {},
) {
	const attempts = options.attempts ?? 6,
		delay = options.delayMs ?? 40,
		doRename = options.renameImpl ?? rename;
	for (let attempt = 1; ; attempt++) {
		try {
			await doRename(from, to);
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (!code || !RENAME_RETRY_CODES.has(code) || attempt >= attempts) throw error;
			await new Promise((resolve) => setTimeout(resolve, delay * attempt));
		}
	}
}

/** Native Pi adapter. Desktop supplies the host's existing scoped capabilities instead. */
export function createLocalWikiReviewPorts(
	config: Pick<KnowledgeConfigApi, "knowledgeDirectory">,
): WikiReviewPorts {
	async function statePath(path: string) {
		const root = config.knowledgeDirectory();
		if (!root) throw new Error("No application knowledge directory");
		return containedVaultFile(root, path);
	}
	const state: WikiReviewPorts["state"] = {
		async read(path) {
			const full = await statePath(path);
			let bytes: Buffer;
			try {
				const info = await lstat(full);
				if (!info.isFile() || info.isSymbolicLink()) throw new Error("Expected a regular review record");
				bytes = await readFile(full);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
				throw error;
			}
			if (bytes.length > 256 * 1024) throw new Error("Wiki proposal exceeds its storage budget");
			return { value: JSON.parse(bytes.toString("utf8")), version: digest(bytes) };
		},
		async list(path) {
			return readdir(await statePath(path));
		},
		async write(path, value, expectedVersion) {
			const full = await statePath(path);
			await mkdir(dirname(full), { recursive: true, mode: 0o700 });
			const temporary = join(dirname(full), `.${randomUUID()}.tmp`);
			const text = `${JSON.stringify(value, null, 2)}\n`;
			await writeFile(temporary, text, { flag: "wx", mode: 0o600 });
			try {
				const current = await state.read(path);
				if ((current?.version ?? null) !== expectedVersion)
					throw new Error("Wiki review state changed; refresh before writing");
				if (expectedVersion === null) await link(temporary, full);
				else await renameWithRetry(temporary, full);
			} finally {
				await rm(temporary, { force: true });
			}
			if ((await state.read(path))?.version !== digest(text))
				throw new Error("Wiki review state write could not be read back");
		},
		async remove(path, expectedVersion) {
			const current = await state.read(path);
			if (current?.version !== expectedVersion)
				throw new Error("Wiki review state changed; refresh before deleting");
			await unlink(await statePath(path));
			if (await state.read(path)) throw new Error("Wiki review state removal could not be read back");
		},
	};
	const files: WikiReviewPorts["files"] = {
		async read(binding, path) {
			try {
				return await readNoteFile(binding.vault, path);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
				throw error;
			}
		},
		async write(binding, path, text, expectedHash, check) {
			let parent = binding.vault;
			for (const part of path.split("/").slice(0, -1)) {
				parent = join(parent, part);
				try {
					await mkdir(parent);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				}
				const info = await lstat(parent);
				if (!info.isDirectory() || info.isSymbolicLink())
					throw new Error("Wiki parent must be a regular directory");
			}
			const full = await containedVaultFile(binding.vault, path);
			const temporary = join(dirname(full), `.${basename(full)}.${randomUUID()}.tmp`);
			const mode = expectedHash === null ? 0o600 : (await lstat(full)).mode & 0o777;
			await writeFile(temporary, text, { flag: "wx", mode });
			try {
				await check();
				if (((await files.read(binding, path))?.hash ?? null) !== expectedHash)
					throw new Error("Wiki changed during review; no overwrite applied");
				if (expectedHash === null) await link(temporary, full);
				else await renameWithRetry(temporary, full);
			} finally {
				await rm(temporary, { force: true });
			}
			if ((await files.read(binding, path))?.hash !== digest(text))
				throw new Error("Wiki write could not be read back");
		},
		async remove(binding, path, expectedHash, check) {
			await check();
			if ((await files.read(binding, path))?.hash !== expectedHash)
				throw new Error("Wiki changed during undo");
			await unlink(await containedVaultFile(binding.vault, path));
			if (await files.read(binding, path)) throw new Error("Wiki removal could not be read back");
		},
	};
	return { state, files };
}
