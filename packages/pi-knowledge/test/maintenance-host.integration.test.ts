import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveKnowledgeBinding } from "../src/core/config.js";
import { knowledgeHostLoader } from "../src/core/host.js";
import * as layout from "../src/core/layout.js";
import { closeKnowledgeServices } from "../src/core/service.js";

let root: string;
let vault: string;
let revision: number;
const port = knowledgeHostLoader.load().maintenanceTopic!;
const sourcePath = "Library/Papers/PMC123.pdf.md";

async function note(path: string, text: string) {
	await mkdir(dirname(join(vault, path)), { recursive: true });
	await writeFile(join(vault, path), text);
}

beforeEach(async () => {
	root = await realpath(
		await mkdtemp(join(tmpdir(), "knowledge-maintenance-host-")),
	);
	vault = join(root, "Vault");
	await mkdir(vault);
	vi.stubEnv("DRONE_KNOWLEDGE_DIR", join(root, "state"));
	knowledgeHostLoader.configureWorker!({
		createWorker: (url, options) => new Worker(url, options),
	});
	const binding = await saveKnowledgeBinding({
		vault,
		profile: "literature",
		depositMode: "verified",
		subagentPolicy: "none",
	});
	revision = binding.revision;
});

afterEach(async () => {
	vi.restoreAllMocks();
	await closeKnowledgeServices();
	vi.unstubAllEnvs();
	await rm(root, { recursive: true, force: true });
});

describe("installed maintenance host with a temporary Vault", () => {
	it("updates the source and existing mirrors, preserves a separately edited mirror title, and is idempotent", async () => {
		await note(
			sourcePath,
			"---\ntype: paper\n---\n\n# Source metadata title\n\nEvidence body.\n",
		);
		await note(
			"Projects/alpha/Papers/PMC123.pdf.md",
			"# Source metadata title\n\nAlpha body.\n",
		);
		await note(
			"Projects/beta/Papers/PMC123.pdf.md",
			"# PMC123.pdf\n\nBeta body.\n",
		);
		await note(
			"Projects/gamma/Papers/PMC123.pdf.md",
			"# My separate human heading\n\nGamma body.\n",
		);
		await mkdir(join(vault, "Projects/without-mirror"));
		const input = {
			notePath: sourcePath,
			topic: "Named research topic",
			revision,
		};
		const result = await port.setTopic(input);
		expect(result).toMatchObject({
			topic: input.topic,
			note: sourcePath,
			changed: true,
		});
		const changed = [
			sourcePath,
			...["alpha", "beta", "gamma"].map(
				(project) => `Projects/${project}/Papers/PMC123.pdf.md`,
			),
		];
		expect((result as { updated: string[] }).updated.sort()).toEqual(
			changed.sort(),
		);
		for (const path of changed)
			expect(await readFile(join(vault, path), "utf8")).toContain(
				'topic: "Named research topic"',
			);
		expect(await readFile(join(vault, sourcePath), "utf8")).toContain(
			"# Named research topic",
		);
		expect(
			await readFile(
				join(vault, "Projects/alpha/Papers/PMC123.pdf.md"),
				"utf8",
			),
		).toContain("# Named research topic");
		expect(
			await readFile(join(vault, "Projects/beta/Papers/PMC123.pdf.md"), "utf8"),
		).toContain("# Named research topic");
		expect(
			await readFile(
				join(vault, "Projects/gamma/Papers/PMC123.pdf.md"),
				"utf8",
			),
		).toContain("# My separate human heading");
		await expect(port.setTopic(input)).resolves.toMatchObject({
			changed: false,
			updated: [],
		});
	});

	it("rejects a stale binding and a symlink source before writing", async () => {
		await note(sourcePath, "# Source\n");
		const input = {
			notePath: sourcePath,
			topic: "Named topic",
			revision: revision + 1,
		};
		await expect(port.setTopic(input)).rejects.toThrow("binding changed");
		expect(await readFile(join(vault, sourcePath), "utf8")).toBe("# Source\n");
		const outside = join(root, "outside.md");
		await writeFile(outside, "# Outside\n");
		await symlink(outside, join(vault, "Library/Papers/link.md"));
		await expect(
			port.setTopic({ ...input, revision, notePath: "Library/Papers/link.md" }),
		).rejects.toThrow("symlink");
		expect(await readFile(outside, "utf8")).toBe("# Outside\n");
	});

	it("preserves a concurrent human edit through the file CAS", async () => {
		await note(sourcePath, "# Source\n");
		const replace = layout.replaceVaultFile;
		vi.spyOn(layout, "replaceVaultFile").mockImplementationOnce(
			async (path, text, options) => {
				await writeFile(path, "# New human edit\n");
				await replace(path, text, options);
			},
		);
		await expect(
			port.setTopic({ notePath: sourcePath, topic: "Named topic", revision }),
		).rejects.toThrow("changed while");
		expect(await readFile(join(vault, sourcePath), "utf8")).toBe(
			"# New human edit\n",
		);
	});

	it("stages a source-backed Wiki proposal without writing the Vault Wiki", async () => {
		await note(
			sourcePath,
			"---\ntype: paper\n---\n\n# Source\n\nObserved evidence in this note.\n",
		);
		const cwd = join(root, "project");
		await mkdir(cwd);
		const result = await port.proposeWiki({
			cwd,
			sourcePath,
			title: "Research topic",
			markdown: "Observed bounded evidence.",
			rationale: "Review the source.",
			revision,
		});
		expect(result).toMatchObject({
			status: "pending",
			path: "Wiki/research-topic.md",
			vaultWritten: false,
			sources: [{ path: sourcePath }],
		});
		await expect(
			readFile(join(vault, "Wiki/research-topic.md"), "utf8"),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			port.proposeWiki({
				cwd,
				sourcePath,
				title: "Another topic",
				markdown: "Evidence",
				rationale: "Review",
				revision: revision + 1,
			}),
		).rejects.toThrow("binding changed");
	});
});
