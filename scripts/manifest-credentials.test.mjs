import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { credentialFailures, networkPolicyFailures } from "./manifest-credentials.mjs";

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
const owned = {
	...valid,
	entrypoints: { ...valid.entrypoints, desktopRuntime: "./dist/index.mjs" },
};

test("a slot may declare host custody but never a secret source", () => {
	const slot = {
		slot: "zotero-local",
		label: { zh: "本机写入", en: "Local writes" },
		hosts: ["127.0.0.1:23119"],
		header: "Zotero-API-Key",
		fields: ["serverId"],
	};
	const managed = {
		...owned,
		permissions: { ...valid.permissions, network: ["127.0.0.1:23119"] },
	};
	const withSlots = (credentials) => ({ ...managed, drone: { ...valid.drone, credentials } });
	const failures = (manifest) => credentialFailures(manifest).join("\n");
	assert.equal(failures(withSlots([slot])), "");
	assert.equal(failures(withSlots([{ ...slot, custody: "host-environment" }])), "");
	assert.equal(failures(withSlots([{ ...slot, custody: "user" }])), "");
	for (const custody of ["host", "", null, true, 1, [], {}])
		assert.match(failures(withSlots([{ ...slot, custody }])), /drone.credentials custody must/);
	for (const key of ["custodySource", "secretSource", "envVar"])
		assert.match(failures(withSlots([{ ...slot, [key]: "SOME_SECRET" }])), /must not name a secret source/);
});

test("a runtime endpoint policy names a declared slot and needs a managed owner", () => {
	const slot = {
		slot: "webdav",
		label: { zh: "密码", en: "Password" },
		hosts: ["dav.example.org"],
		header: "Authorization",
		fields: [],
		authentication: "http-basic-digest",
	};
	const managed = {
		...owned,
		permissions: { ...valid.permissions, network: ["dav.example.org"] },
	};
	const withPolicy = (networkPolicy, manifest = managed) => ({
		...manifest,
		drone: { ...valid.drone, credentials: [slot], networkPolicy },
	});
	const failures = (manifest) => networkPolicyFailures(manifest).join("\n");
	assert.equal(failures(withPolicy({ runtimeEndpoint: { allowed: true, credentialSlot: "webdav" } })), "");
	assert.match(
		failures(withPolicy({ runtimeEndpoint: { allowed: true, credentialSlot: "other" } })),
		/must name a declared credential slot/,
	);
	assert.match(
		failures(withPolicy({ runtimeEndpoint: { allowed: false, credentialSlot: "webdav" } })),
		/allowed must be true/,
	);
	assert.match(failures(withPolicy({ runtimeEndpoint: { allowed: true } })), /must be a slot name/);
	assert.match(failures(withPolicy({})), /must declare runtimeEndpoint/);
	assert.match(
		failures(
			withPolicy(
				{ runtimeEndpoint: { allowed: true, credentialSlot: "webdav" } },
				{ ...managed, entrypoints: valid.entrypoints },
			),
		),
		/requires desktopRuntime ownership/,
	);
});
