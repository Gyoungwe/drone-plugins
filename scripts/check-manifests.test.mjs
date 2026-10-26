import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validatePackageManifest } from "./check-manifests.mjs";

const packageRoot = fileURLToPath(new URL("../packages/pi-analysis/", import.meta.url));
const packageJson = {
	name: "@example/plugin",
	version: "1.2.3",
	type: "module",
	files: ["dist", "plugin.manifest.json", "README.md"],
	dependencies: { "@gyoungwe/plugin-api": "^1.0.0" },
	peerDependencies: { "@earendil-works/pi-coding-agent": ">=1.1.0 <2" },
};
const valid = {
	schemaVersion: 1,
	id: "drone-example",
	version: "1.2.3",
	drone: { pluginApi: 1, resultContract: "drone-result/v3" },
	entrypoints: { extension: "./dist/index.mjs" },
	capabilities: ["analysis"],
	tools: ["example_run"],
	hosts: ["native-pi"],
	permissions: { filesystem: ["workspace-read"], network: [], subprocess: [], externalWrites: false },
};

function errors(manifest = valid, pkg = packageJson, root = packageRoot) {
	return validatePackageManifest(pkg, manifest, root).join("\n");
}

test("manifest checker accepts a complete declaration", () => assert.equal(errors(), ""));

const cases = [
	["id", { id: "bad" }, "id must match"],
	["version", { version: "9.9.9" }, "version must match"],
	["capability vocabulary", { capabilities: ["telepathy"] }, "unknown capability"],
	["entrypoint existence", { entrypoints: { extension: "./dist/missing.mjs" } }, "does not exist"],
	["entrypoint files coverage", { entrypoints: { extension: "./outside.mjs" } }, "not covered by files"],
	["permissions shape", { permissions: { filesystem: ["root-access"] } }, "invalid value"],
	["tools required", { tools: undefined }, "must declare tools"],
	["tools names", { tools: ["Bad Tool"] }, "invalid tool name"],
	["dependency rule", {}, "must not depend on another Drone plugin"],
	["runtime peer rule", {}, "Pi runtime must be a peerDependency"],
];

for (const [name, changes, expected] of cases) {
	test(`rejects ${name}`, () => {
		const manifest = { ...valid, ...changes };
		const pkg = { ...packageJson };
		if (name === "dependency rule") pkg.dependencies = { ...pkg.dependencies, "@gyoungwe/pi-other": "1.0.0" };
		if (name === "runtime peer rule") pkg.dependencies = { ...pkg.dependencies, "@earendil-works/pi-ai": "1.1.0" };
		assert.match(errors(manifest, pkg), new RegExp(expected));
	});
}

test("allows a UI-only package to omit tools", () => {
	const uiRoot = fileURLToPath(new URL("../packages/desktop-ui-pack/", import.meta.url));
	const manifest = {
		...valid,
		entrypoints: { ui: "./ui/plugin.json" },
		capabilities: ["ui"],
		tools: undefined,
	};
	const pkg = { ...packageJson, version: "1.2.3", files: ["ui", "plugin.manifest.json"] };
	assert.equal(errors(manifest, pkg, uiRoot), "");
});

test("rejects contradictory external write declarations", () => {
	const manifest = {
		...valid,
		permissions: {
			filesystem: [],
			network: [],
			subprocess: [],
			externalWrites: true,
			readWrite: { read: true, write: false, delete: false },
		},
	};
	assert.match(errors(manifest), /externalWrites=true conflicts/);
});

test("rejects a readWrite write permission when external writes are disabled", () => {
	const manifest = {
		...valid,
		permissions: {
			filesystem: [],
			network: [],
			subprocess: [],
			externalWrites: false,
			readWrite: { read: true, write: true, delete: false },
		},
	};
	assert.match(errors(manifest), /externalWrites=false conflicts/);
});

// This is a bounded declared scope, not a general home-directory grant.
test("accepts application-state and rejects invented broad state roots", () => {
	assert.equal(errors({ ...valid, permissions: { ...valid.permissions, filesystem: ["application-state"] } }), "");
	assert.equal(errors({ ...valid, permissions: { ...valid.permissions, filesystem: ["application-state-write"] } }), "");
	assert.match(errors({ ...valid, permissions: { ...valid.permissions, filesystem: ["application-state/**"] } }), /invalid value/);
	assert.match(errors({ ...valid, permissions: { ...valid.permissions, filesystem: ["application-state-write/**"] } }), /invalid value/);
});


test("resources must have a Desktop owner and real packaged entries", () => {
 const entrypoints = { desktopRuntime: "./dist/index.mjs", resources: { index: "./dist/index.mjs" } };
 assert.equal(errors({ ...valid, entrypoints }), "");
 assert.match(errors({ ...valid, entrypoints: { resources: entrypoints.resources } }), /resources require desktopRuntime/);
 assert.match(errors({ ...valid, entrypoints: { ...entrypoints, resources: { index: "./dist/missing.mjs" } } }), /does not exist/);
 assert.match(errors({ ...valid, entrypoints: { ...entrypoints, resources: [] } }), /nonempty resource IDs/);
 assert.match(errors({ ...valid, entrypoints: { ...entrypoints, resources: { "": "./dist/index.mjs" } } }), /nonempty resource IDs/);
});
