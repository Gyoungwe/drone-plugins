import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KnowledgeConfigApi } from "./config.js";
import type {
	KnowledgeReviewPolicyStorage,
	ReviewPolicyDocument,
} from "./review-policy.js";

/** CLI persistence adapter; Desktop uses the host's authorized JSON store. */
export function createLocalReviewPolicyStorage(
	config: Pick<KnowledgeConfigApi, "knowledgeDirectory">,
): KnowledgeReviewPolicyStorage {
	let queue: Promise<unknown> = Promise.resolve();
	async function read(): Promise<ReviewPolicyDocument> {
		const directory = config.knowledgeDirectory();
		if (!directory) return { kind: "missing", version: null };
		let bytes: Buffer;
		try {
			bytes = await readFile(join(directory, "review-policy.json"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT")
				return { kind: "missing", version: null };
			throw error;
		}
		let value: unknown;
		try {
			value = JSON.parse(bytes.toString("utf8"));
		} catch (error) {
			if (!(error instanceof SyntaxError)) throw error;
			// Strict mode stays active and the caller sees an invalid-json diagnostic.
			console.warn(
				"[knowledge review policy] Invalid JSON; strict mode applies",
			);
			return { kind: "corrupt", version: null };
		}
		return {
			kind: "value",
			value,
			version: createHash("sha256").update(bytes).digest("hex"),
		};
	}
	return {
		read,
		write(value, expectedVersion) {
			// A prior write rejects to its caller; only its settlement orders the next write.
			const operation = queue
				.catch(() => undefined)
				.then(async () => {
					const directory = config.knowledgeDirectory();
					if (!directory) throw new Error("No application knowledge directory");
					const current = await read();
					if (current.kind === "corrupt")
						throw new Error(
							"Review policy is damaged; repair it before changing settings",
						);
					if (current.version !== expectedVersion)
						throw Object.assign(
							new Error("Review policy changed; refresh before saving"),
							{ code: "ESTATECONFLICT" },
						);
					await mkdir(directory, { recursive: true, mode: 0o700 });
					const temporary = join(
						directory,
						`review-policy.${randomUUID()}.tmp`,
					);
					await writeFile(temporary, JSON.stringify(value), {
						flag: "wx",
						mode: 0o600,
					});
					try {
						await rename(temporary, join(directory, "review-policy.json"));
					} catch (error) {
						await unlink(temporary);
						throw error;
					}
					return read();
				});
			queue = operation;
			return operation;
		},
	};
}
