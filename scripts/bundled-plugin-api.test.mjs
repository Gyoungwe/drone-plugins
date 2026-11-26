import assert from "node:assert/strict";
import test from "node:test";
import { matchesPluginApiDependency } from "./bundled-plugin-api.mjs";

const apiName = "@gyoungwe/plugin-api";
const apiSpec =
	"https://github.com/Gyoungwe/Drone/releases/download/plugin-api-v2.0.0/gyoungwe-plugin-api-2.0.0.tgz";

for (const name of ["pi-core", "pi-knowledge", "pi-analysis", "pi-research"]) {
	test(`${name} accepts the canonical bundled Plugin API dependency`, () => {
		assert.equal(
			matchesPluginApiDependency(
				{
					name: `@gyoungwe/${name}`,
					dependencies: { [apiName]: apiSpec },
					bundleDependencies: [apiName],
				},
				apiSpec,
			),
			true,
		);
	});
}

test("pi-research rejects the retired optional Plugin API peer dependency", () => {
	assert.equal(
		matchesPluginApiDependency(
			{
				name: "@gyoungwe/pi-research",
				peerDependencies: { [apiName]: ">=2.0.0 <3.0.0" },
				peerDependenciesMeta: { [apiName]: { optional: true } },
			},
			apiSpec,
		),
		false,
	);
});
