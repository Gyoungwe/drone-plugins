import { expect, it } from "vitest";
import { CloudError, type CloudHttp, httpError } from "../src/desktop/cloud.js";
import { CloudDav, strongEtag } from "../src/desktop/cloud-dav.js";

function davXml(href = "/Drone-Knowledge/", propertyStatus = 200, resource = "<d:collection/>") {
	return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype>${resource}</d:resourcetype></d:prop><d:status>HTTP/1.1 ${propertyStatus} Status</d:status></d:propstat></d:response></d:multistatus>`;
}

function reply(status: number, body = "", headers: Record<string, string> = {}) {
	return { status, body: new TextEncoder().encode(body), headers };
}

type Request = Parameters<CloudHttp["request"]>[0];
function fixture(responses: ReturnType<typeof reply>[]) {
	const requests: Request[] = [];
	const http: CloudHttp = {
		request: async (input) => {
			requests.push(input);
			const next = responses.shift();
			if (!next) throw new Error("Unexpected request");
			return next;
		},
	};
	return { requests, dav: new CloudDav(http, "https://dav.example.test") };
}

it("accepts only bounded strong ETags", () => {
	expect(strongEtag('"x"')).toBe('"x"');
	expect(strongEtag('""')).toBe('""');
	expect(strongEtag('"é"')).toBe('"é"');
	for (const tag of [undefined, null, 'W/"x"', "*", "yesterday", '"a\nb"', '"a"b"', `"${"a".repeat(1023)}"`])
		expect(strongEtag(tag)).toBeNull();
});

it.each([
	[401, "unauthorized"],
	[403, "forbidden"],
	[404, "not_found"],
	[409, "conflict"],
	[412, "conflict"],
	[423, "conflict"],
	[428, "conflict"],
	[302, "protocol"],
	[500, "protocol"],
])("maps HTTP %i to %s without response content", (status, code) => {
	expect(httpError(Number(status))).toMatchObject({ code, status });
	expect(httpError(Number(status)).message).toBe(code);
});

it.each([200, 207])("parses DAV multistatus with HTTP %i and Depth 0", async (status) => {
	const { dav, requests } = fixture([reply(status, davXml())]);
	expect(await dav.collection("Drone-Knowledge/")).toBe(true);
	expect(requests).toEqual([
		{
			method: "PROPFIND",
			path: "Drone-Knowledge/",
			headers: { Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
			body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
		},
	]);
});

it("accepts matching absolute and relative hrefs and an optional trailing slash", async () => {
	for (const href of ["https://dav.example.test/Drone-Knowledge", "/Drone-Knowledge", "./"]) {
		const { dav } = fixture([reply(207, davXml(href))]);
		expect(await dav.collection("Drone-Knowledge/")).toBe(true);
	}
});

it.each([
	["empty XML", ""],
	["missing root", " "],
	["DOCTYPE", `<!DOCTYPE x>${davXml()}`],
	["ENTITY", `<!ENTITY x "fake">${davXml()}`],
	["wrong root", '<d:collection xmlns:d="DAV:"/>'],
	["wrong namespace", davXml().replace("DAV:", "urn:fake")],
	["foreign origin", davXml("https://other.example.test/Drone-Knowledge/")],
	["wrong path", davXml("/other/")],
	["invalid href", davXml("http://[")],
	["non-200 propstat", davXml(undefined, 403)],
	["file resource", davXml(undefined, 200, "")],
	["missing href", davXml().replace(/<d:href>.*?<\/d:href>/, "")],
	["malformed XML", davXml().replace("<d:collection/>", "<d:collection>")],
	["oversize XML", `${davXml()}${" ".repeat(64 * 1024)}`],
])("rejects %s", async (_name, xml) => {
	const { dav } = fixture([reply(207, xml)]);
	await expect(dav.collection("Drone-Knowledge/")).rejects.toMatchObject({ code: "protocol" });
});

it("accepts XML at exactly the 64 KiB cap", async () => {
	const xml = davXml();
	const { dav } = fixture([reply(207, xml.padEnd(64 * 1024))]);
	expect(await dav.collection("Drone-Knowledge/")).toBe(true);
});

it("maps a direct DAV response status", async () => {
	const xml = davXml().replace("<d:propstat>", "<d:status>HTTP/1.1 403 Forbidden</d:status><d:propstat>");
	const { dav } = fixture([reply(207, xml)]);
	await expect(dav.collection("Drone-Knowledge/")).rejects.toMatchObject({
		code: "forbidden",
		status: 403,
	});
});

it("returns false only for HTTP 404 and maps other statuses", async () => {
	const { dav } = fixture([reply(404), reply(401)]);
	expect(await dav.collection("Drone-Knowledge/")).toBe(false);
	await expect(dav.collection("Drone-Knowledge/")).rejects.toMatchObject({ code: "unauthorized" });
});

it.each([201, 405])("rechecks the collection after MKCOL %i", async (status) => {
	const { dav, requests } = fixture([reply(404), reply(status), reply(207, davXml())]);
	await dav.ensureCollection("Drone-Knowledge/");
	expect(requests.map((request) => request.method)).toEqual(["PROPFIND", "MKCOL", "PROPFIND"]);
});

it("does not recreate an existing collection", async () => {
	const { dav, requests } = fixture([reply(207, davXml())]);
	await dav.ensureCollection("Drone-Knowledge/");
	expect(requests).toHaveLength(1);
});

it.each([davXml(undefined, 200, ""), ""])(
	"rejects MKCOL 405 when recheck finds a file or missing collection",
	async (xml) => {
		const { dav } = fixture([reply(404), reply(405), reply(xml ? 207 : 404, xml)]);
		await expect(dav.ensureCollection("Drone-Knowledge/")).rejects.toMatchObject({ code: "protocol" });
	},
);

it("maps rejected MKCOL and thrown port errors without exposing details", async () => {
	const { dav } = fixture([reply(404), reply(403)]);
	await expect(dav.ensureCollection("Drone-Knowledge/")).rejects.toMatchObject({ code: "forbidden" });
	const offline = new CloudDav(
		{
			request: async () => {
				throw new Error("fake-private-detail");
			},
		},
		"https://dav.example.test",
	);
	await expect(offline.collection("Drone-Knowledge/")).rejects.toEqual(new CloudError("offline"));
});
