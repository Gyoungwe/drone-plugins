import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { parseDocument } from "yaml";

const root = resolve(import.meta.dirname, "..");
const raw = readFileSync(join(root, ".github/workflows/publish.yml"), "utf8");
const document = parseDocument(raw, { version: "1.2", uniqueKeys: true });

test("publishing dispatches one existing workspace with its exact expected version", () => {
	assert.deepEqual(document.errors, []);
	const workflow = document.toJS();
	assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
	const { package: workspace, expected_version: version } = workflow.on.workflow_dispatch.inputs;
	const workspaces = readdirSync(join(root, "packages"), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	assert.equal(workspaces.length, 8);
	assert.equal(workspace.required, true);
	assert.equal(workspace.type, "choice");
	assert.deepEqual([...workspace.options].sort(), workspaces);
	assert.equal(version.type, "string");
	assert.equal(version.required, true);
	assert.equal(workflow.concurrency["cancel-in-progress"], false);
	assert.doesNotMatch(raw, /npm\s+publish|id-token|registry-url|all-pending/u);
});

test("release preflight rejects a version mismatch and private candidates", () => {
	const check = (slug, version) =>
		spawnSync(process.execPath, ["scripts/smoke-packed-plugin.mjs", "--preflight", slug, version], {
			cwd: root,
			encoding: "utf8",
		});
	const inquiry = JSON.parse(readFileSync(join(root, "packages/pi-inquiry/package.json"), "utf8"));
	const mismatch = check("pi-inquiry", "0.0.0");
	assert.equal(mismatch.status, 1);
	assert.match(mismatch.stderr, /Expected @gyoungwe\/pi-inquiry@0\.0\.0/u);
	const candidate = check("pi-inquiry", inquiry.version);
	assert.equal(candidate.status, inquiry.private ? 1 : 0);
	if (inquiry.private) assert.match(candidate.stderr, /marked private in package\.json/u);
});

test("only the main-branch writer receives the GitHub write token", () => {
	const workflow = document.toJS();
	assert.deepEqual(workflow.permissions, {});
	assert.deepEqual(Object.keys(workflow.jobs), ["build", "release"]);
	assert.equal(workflow.env.DRONE_PLUGIN_API_RELEASE, "1");
	const { build, release } = workflow.jobs;
	for (const job of [build, release]) {
		assert.match(job.if, /^github\.ref == 'refs\/heads\/main'$/u);
		const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
		assert.equal(checkout.with.ref, `\${{ github.sha }}`);
		assert.equal(checkout.with["persist-credentials"], false);
		for (const { run } of job.steps) if (run) execFileSync("bash", ["-n"], { input: run });
	}
	assert.deepEqual(build.permissions, { contents: "read" });
	assert.deepEqual(release.permissions, { contents: "write" });
	assert.equal(release.needs, "build");
	assert(!workflow.env.GH_TOKEN && !release.env?.GH_TOKEN);
	assert(!build.steps.some((step) => step.env?.GH_TOKEN));
	const tokenSteps = release.steps.filter((step) => step.env?.GH_TOKEN);
	assert.equal(tokenSteps.length, 1);
	assert.equal(tokenSteps[0].env.GH_TOKEN, `\${{ github.token }}`);
	assert.match(tokenSteps[0].run, /gh release create/u);
});

function inOrder(script, ...markers) {
	let cursor = 0;
	for (const marker of markers) {
		const index = script.indexOf(marker, cursor);
		assert(index >= 0, `Missing or misordered workflow guard: ${marker}`);
		cursor = index + marker.length;
	}
}

test("the build hands off a smoke-tested archive and the writer verifies state and bytes", () => {
	const { build, release } = document.toJS().jobs;
	const buildRun = build.steps.map((step) => step.run).join("\n");
	inOrder(
		buildRun,
		"git rev-parse HEAD",
		"--preflight",
		"node scripts/prepare-plugin-api.mjs",
		"npm ci",
		"npm run check",
		"npm pack --json --ignore-scripts -w",
		"--packed",
		'sha256sum -- "$asset" > SHA256SUMS',
	);
	const writer = release.steps.find((step) => step.env?.GH_TOKEN).run;
	inOrder(
		writer,
		'test "$actual_head" = "$GITHUB_SHA"',
		'test "$artifact_sha256" = "$BUILD_SHA256"',
		'tag_ref="$(matching_tag)"',
		'existing_release="$(tagged_release)"',
		'gh release create "$tag"',
		"--draft --latest=false",
		"for attempt in 1 2 3 4 5 6",
		"gh release download",
		"retrying",
		'test "$draft_verified" = true',
		'cmp "$asset_dir/SHA256SUMS" "$verified/SHA256SUMS"',
		'cmp "$asset_dir/$asset" "$verified/$asset"',
		'test "$draft_commit" = "$GITHUB_SHA"',
		'gh release edit "$tag"',
		"--draft=false --latest=false",
	);
	assert.match(writer, /matching-refs\/tags/u);
	assert.match(writer, /gh api --paginate .*\/releases\?/u);
	assert.match(writer, /retrying.*>&2/u);
	const publicReadback = release.steps.at(-1);
	assert(!publicReadback.env?.GH_TOKEN);
	inOrder(
		publicReadback.run,
		"https://github.com/$GITHUB_REPOSITORY/releases/download/$tag",
		"curl -q",
		"SHA256SUMS",
		"ls-remote",
		'test "$published_commit" = "$GITHUB_SHA"',
	);
});
