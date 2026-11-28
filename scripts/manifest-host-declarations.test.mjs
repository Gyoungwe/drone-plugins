import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HOST_EVENT_TOPICS, hostDeclarationFailures } from "./manifest-host-declarations.mjs";

const piInquiry = JSON.parse(
	await readFile(new URL("../packages/pi-inquiry/plugin.manifest.json", import.meta.url), "utf8"),
);
const valid = {
	entrypoints: { desktopRuntime: "./dist/runtime.mjs" },
	drone: { hostEvents: [...HOST_EVENT_TOPICS], inquiryRerun: "request" },
};

test("accepts the pi-inquiry host declarations", () => {
	assert.deepEqual([...piInquiry.drone.hostEvents].sort(), [...HOST_EVENT_TOPICS].sort());
	assert.equal(piInquiry.drone.inquiryRerun, "request");
	assert.deepEqual(hostDeclarationFailures(piInquiry), []);
	assert.deepEqual(hostDeclarationFailures(valid), []);
});

for (const [name, hostEvents, pattern] of [
	["non-array", "inquiry.compute", /nonempty array/],
	["empty", [], /nonempty array/],
	["duplicate", ["inquiry.compute", "inquiry.compute"], /must be unique/],
	["non-string", ["inquiry.compute", 4], /entries must be strings/],
	["unknown", ["inquiry.not-real"], /unknown host event topic inquiry\.not-real/],
])
	test(`rejects ${name} host event declarations`, () => {
		assert.match(hostDeclarationFailures({ ...valid, drone: { hostEvents } }).join("\n"), pattern);
	});

test("host event and rerun declarations require a desktop runtime owner", () => {
	for (const drone of [{ hostEvents: ["inquiry.compute"] }, { inquiryRerun: "request" }])
		assert.match(hostDeclarationFailures({ drone }).join("\n"), /requires desktopRuntime ownership/);
});

test("inquiry rerun accepts only a request declaration", () => {
	assert.match(
		hostDeclarationFailures({ ...valid, drone: { inquiryRerun: "allow" } }).join("\n"),
		/must be "request"/,
	);
});
