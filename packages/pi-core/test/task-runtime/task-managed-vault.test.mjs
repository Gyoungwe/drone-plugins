import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { harness } from "./managed-harness.mjs";

// Vault (knowledge-bound) file acceptance in the managed runtime: the knowledge plugin's
// knowledge.binding service names the bound Vault, the host reads the file under the session's
// current read permissions, and pi-core checks the file stays inside that Vault.
const vaults = [];
afterEach(async () => {
	for (const dir of vaults.splice(0)) await rm(dir, { recursive: true, force: true });
});

const vaultPlan = {
	goal: "Write the summary note",
	summary: "Write the summary into the Vault",
	writeDirectories: ["out"],
	milestones: [
		{
			id: "v",
			title: "Summary note",
			acceptance: { kind: "file", path: "notes/summary.md", rootKind: "vault" },
		},
	],
};

async function boundVault() {
	const vault = await realpath(await mkdtemp(join(tmpdir(), "managed-vault-")));
	vaults.push(vault);
	await mkdir(join(vault, "notes"));
	const binding = { vaultId: "a".repeat(24), revision: 1, vault };
	const t = await harness({
		extra: {
			"provider.inspect": ({ alias }) => ({
				state: alias === "knowledge" ? "available" : "absent",
				service: "knowledge.binding",
				requestedVersion: 1,
				provider: { pluginId: "@gyoungwe/pi-knowledge", version: 1, contentHash: "h" },
			}),
			"provider.read": ({ alias, operation }) => {
				if (alias !== "knowledge" || operation !== "binding") throw new Error("Undeclared provider alias");
				return { ...binding };
			},
		},
	});
	return { t, vault, binding };
}

const reconcileVault = async (t) => {
	await t.hooks.input({ text: vaultPlan.goal, images: [] }, t.ctx);
	await t.tool("task_plan", vaultPlan);
	await t.tool("task_reconcile", {});
	await t.command("task-status", "");
	return t.host.notices.at(-1).view.tasks[0].milestones[0];
};

it("a Vault file milestone is accepted inside the Vault the knowledge service names", async () => {
	const { t, vault } = await boundVault();
	await writeFile(join(vault, "notes/summary.md"), "# Summary");
	const milestone = await reconcileVault(t);
	expect(milestone).toMatchObject({
		state: "completed",
		evidence: { rootKind: "vault", path: "notes/summary.md", absolutePath: join(vault, "notes/summary.md") },
	});
	await t.close();
});

it("a changed binding stops Vault acceptance instead of checking the new destination", async () => {
	const { t, vault, binding } = await boundVault();
	await writeFile(join(vault, "notes/summary.md"), "# Summary");
	await t.hooks.input({ text: vaultPlan.goal, images: [] }, t.ctx);
	await t.tool("task_plan", vaultPlan);
	binding.revision = 2;
	await t.tool("task_reconcile", {});
	await t.command("task-status", "");
	expect(t.host.notices.at(-1).view.tasks[0].milestones[0].state).toBe("blocked");
	await t.close();
});

it("a Vault path that leaves the Vault is refused", async () => {
	const { t, vault } = await boundVault();
	const outside = join(vault, "..", `${vault.split("/").at(-1)}-outside.md`);
	await writeFile(outside, "# Outside");
	vaults.push(outside);
	await t.hooks.input({ text: vaultPlan.goal, images: [] }, t.ctx);
	await t.tool("task_plan", {
		...vaultPlan,
		milestones: [
			{
				...vaultPlan.milestones[0],
				acceptance: { ...vaultPlan.milestones[0].acceptance, path: `../${outside.split("/").at(-1)}` },
			},
		],
	});
	await t.tool("task_reconcile", {});
	await t.command("task-status", "");
	expect(t.host.notices.at(-1).view.tasks[0].milestones[0]).toMatchObject({
		state: "blocked",
		evidence: { code: "file-scope" },
	});
	await t.close();
});
