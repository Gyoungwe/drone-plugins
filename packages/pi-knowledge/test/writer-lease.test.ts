import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";

let root: string;
let vault: string;
let otherVault: string;
let indexPath: string;
let leaseDirectory: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "knowledge-writer-lease-"));
	vault = join(root, "vault");
	otherVault = join(root, "other-vault");
	indexPath = join(root, "index.sqlite");
	leaseDirectory = join(root, "leases");
	mkdirSync(vault);
	mkdirSync(otherVault);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("knowledge writer lease", () => {
	it("excludes both shared Vault and shared index writers and releases a partial acquisition", () => {
		const first = acquireKnowledgeWriterLease(
			{ vault, indexPath },
			leaseDirectory,
		);
		expect(() =>
			acquireKnowledgeWriterLease(
				{ vault, indexPath: join(root, "other.sqlite") },
				leaseDirectory,
			),
		).toThrow("already reserved");
		expect(() =>
			acquireKnowledgeWriterLease(
				{ vault: otherVault, indexPath },
				leaseDirectory,
			),
		).toThrow("already reserved");
		const unrelated = acquireKnowledgeWriterLease(
			{ vault: otherVault, indexPath: join(root, "other.sqlite") },
			leaseDirectory,
		);
		unrelated.release();
		first.release();
		first.release();
		expect(readdirSync(leaseDirectory)).toEqual([]);
		const successor = acquireKnowledgeWriterLease(
			{ vault, indexPath },
			leaseDirectory,
		);
		successor.release();
		expect(readdirSync(vault)).toEqual([]);
	});

	it("canonicalizes filesystem aliases before taking ownership", () => {
		writeFileSync(indexPath, "");
		const alias = join(root, "vault-alias");
		const indexAlias = join(root, "index-alias.sqlite");
		symlinkSync(vault, alias, "dir");
		symlinkSync(indexPath, indexAlias, "file");
		const owner = acquireKnowledgeWriterLease(
			{ vault, indexPath },
			leaseDirectory,
		);
		expect(() =>
			acquireKnowledgeWriterLease(
				{ vault: alias, indexPath: join(root, "other.sqlite") },
				leaseDirectory,
			),
		).toThrow("already reserved");
		expect(() =>
			acquireKnowledgeWriterLease(
				{ vault: otherVault, indexPath: indexAlias },
				leaseDirectory,
			),
		).toThrow("already reserved");
		owner.release();
	});

	it("does not delete a replaced lease while releasing its other resource", () => {
		const owner = acquireKnowledgeWriterLease(
			{ vault, indexPath },
			leaseDirectory,
		);
		const replaced = join(leaseDirectory, readdirSync(leaseDirectory)[0]);
		unlinkSync(replaced);
		writeFileSync(replaced, "different-owner\n");
		expect(() => owner.release()).toThrow("lease release failed");
		expect(readdirSync(leaseDirectory)).toHaveLength(1);
		expect(readFileSync(replaced, "utf8")).toBe("different-owner\n");
	});

	it("rejects an independent process, allows it after release, and retains crash residue", () => {
		const bundle = join(root, "lease.mjs");
		buildSync({
			entryPoints: [
				fileURLToPath(new URL("../src/core/writer-lease.ts", import.meta.url)),
			],
			outfile: bundle,
			bundle: true,
			platform: "node",
			format: "esm",
		});
		const script = `
import { pathToFileURL } from 'node:url';
const { acquireKnowledgeWriterLease } = await import(pathToFileURL(process.argv[1]));
const lease = acquireKnowledgeWriterLease({vault:process.argv[2],indexPath:process.argv[3]},process.argv[4]);
if (process.argv[5] === 'release') lease.release();
process.stdout.write('acquired');`;
		const args = [
			"--input-type=module",
			"-e",
			script,
			bundle,
			vault,
			indexPath,
			leaseDirectory,
		];
		const owner = acquireKnowledgeWriterLease(
			{ vault, indexPath },
			leaseDirectory,
		);
		const blocked = spawnSync(process.execPath, [...args, "release"], {
			encoding: "utf8",
		});
		expect(blocked.status).not.toBe(0);
		expect(blocked.stderr).toContain("already reserved");
		owner.release();
		expect(
			execFileSync(process.execPath, [...args, "release"], {
				encoding: "utf8",
			}),
		).toBe("acquired");
		expect(readdirSync(leaseDirectory)).toEqual([]);
		expect(
			execFileSync(process.execPath, [...args, "crash"], { encoding: "utf8" }),
		).toBe("acquired");
		expect(() =>
			acquireKnowledgeWriterLease({ vault, indexPath }, leaseDirectory),
		).toThrow("already reserved");
		expect(readdirSync(leaseDirectory)).toHaveLength(2);
	});
});
