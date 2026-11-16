import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validatePackageManifest } from "./check-manifests.mjs";
import { APPROVAL_CATEGORIES } from "./manifest-approvals.mjs";

const packageRoot = fileURLToPath(new URL("../packages/pi-analysis/", import.meta.url));
const packageJson = {
	name: "@example/plugin",
	version: "1.2.3",
	type: "module",
	files: ["src", "plugin.manifest.json", "README.md"],
	dependencies: { "@gyoungwe/plugin-api": "^1.0.0" },
	peerDependencies: { "@earendil-works/pi-coding-agent": ">=1.1.0 <2" },
};
const manifest = {
	schemaVersion: 1,
	id: "drone-example",
	version: "1.2.3",
	drone: { pluginApi: 1, resultContract: "drone-result/v3" },
	entrypoints: { extension: "./src/index.ts" },
	capabilities: ["analysis"],
	tools: ["example_run"],
	hosts: ["native-pi"],
	permissions: { filesystem: ["workspace-read"], network: [], subprocess: [], externalWrites: false },
};

function errors(permissions) {
	return validatePackageManifest(
		packageJson,
		{ ...manifest, permissions: { ...manifest.permissions, ...permissions } },
		packageRoot,
	);
}

test("exports exactly the decided approval categories", () => {
	assert.deepEqual([...APPROVAL_CATEGORIES], ["subprocess-install", "background-model-spend"]);
});

for (const permission of [
	"workspace-read",
	"workspace",
	"workspace-write",
	"configured-vault",
	"configured-vault-write",
	"vault-read",
	"application-state",
	"application-state-write",
	"binary-state-read",
	"binary-state-write",
]) {
	test(`accepts filesystem permission ${permission} without a model declaration`, () => {
		assert.deepEqual(errors({ filesystem: [permission] }), []);
	});
}

test("accepts a background model spend declaration", () => {
	assert.deepEqual(errors({ model: ["background-model-spend"] }), []);
});

test("accepts an empty model declaration", () => {
	assert.deepEqual(errors({ model: [] }), []);
});

for (const [name, permissions, expected] of [
	["undecoded project-read", { filesystem: ["project-read"] }, /filesystem has invalid value project-read/],
	["unknown filesystem value", { filesystem: ["root-access"] }, /filesystem has invalid value root-access/],
	["non-array filesystem", { filesystem: "workspace-read" }, /filesystem must be an array of strings/],
	[
		"installation as model spend",
		{ model: ["subprocess-install"] },
		/model has invalid value subprocess-install/,
	],
	["non-array model", { model: "background-model-spend" }, /model must be an array of strings/],
	[
		"duplicate model spend",
		{ model: ["background-model-spend", "background-model-spend"] },
		/model must be unique/,
	],
	["unknown model value", { model: ["unlimited-spend"] }, /model has invalid value unlimited-spend/],
	[
		"unknown permission key",
		{ approvalCategories: ["subprocess-install"] },
		/approvalCategories is not supported/,
	],
]) {
	test(`rejects ${name}`, () => {
		assert.match(errors(permissions).join("\n"), expected);
	});
}
