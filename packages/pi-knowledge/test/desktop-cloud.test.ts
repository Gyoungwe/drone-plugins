import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
	CloudError,
	type CloudHttp,
	CloudService,
	DEFAULT_WEBDAV_ENDPOINT,
	DEFAULT_WEBDAV_FOLDER,
	DEFAULT_WEBDAV_USERNAME,
} from "../src/desktop/cloud.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
type Request = Parameters<CloudHttp["request"]>[0];
function reply(status: number, body = "", headers: Record<string, string> = {}) {
	return { status, body: new TextEncoder().encode(body), headers };
}
function collection(path: string) {
	return reply(
		207,
		`<d:multistatus xmlns:d="DAV:"><d:response><d:href>/${path}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,
	);
}
function fixture(
	respond: (input: Request) => ReturnType<typeof reply> = (input) =>
		input.method === "PROPFIND" ? collection(input.path) : reply(200, "# fake note\n", { etag: '"v2"' }),
) {
	const requests: Request[] = [];
	const http: CloudHttp = {
		request: async (input) => {
			requests.push(input);
			return respond(input);
		},
	};
	return { requests, cloud: new CloudService({ http }) };
}

it("owns the approved defaults and makes no request during construction", () => {
	const { cloud, requests } = fixture();
	expect([cloud.endpoint, cloud.username, cloud.folder]).toEqual([
		DEFAULT_WEBDAV_ENDPOINT,
		DEFAULT_WEBDAV_USERNAME,
		DEFAULT_WEBDAV_FOLDER,
	]);
	expect([cloud.endpoint, cloud.username, cloud.folder]).toEqual([
		"http://10.126.126.1:8080",
		"gaoyangwei",
		"Drone-Knowledge",
	]);
	expect(requests).toEqual([]);
});

it("uses a non-secret endpoint override for DAV href matching", async () => {
	const requests: Request[] = [];
	const cloud = new CloudService({
		endpoint: "https://dav.example.test",
		http: {
			request: async (input) => {
				requests.push(input);
				return collection(input.path);
			},
		},
	});
	expect(await cloud.probe()).toEqual({ initialized: true });
	expect(cloud.endpoint).toBe("https://dav.example.test");
	expect(requests.map((request) => request.path)).toEqual(["Drone-Knowledge/"]);
});

it.each([
	"bad",
	"ftp://dav.example.test",
	"https://dav.example.test/path",
	"https://dav.example.test/?x=1",
	"https://dav.example.test/#x",
	"https://fake-user@dav.example.test",
])("rejects invalid endpoint %s before requesting", (endpoint) => {
	const requests: Request[] = [];
	expect(
		() =>
			new CloudService({
				endpoint,
				http: {
					request: async (input) => {
						requests.push(input);
						return reply(200);
					},
				},
			}),
	).toThrow(CloudError);
	expect(requests).toEqual([]);
});

it("probes a missing folder without creating it and checks the root", async () => {
	const { cloud, requests } = fixture((input) => (input.path ? reply(404) : collection("")));
	expect(await cloud.probe()).toEqual({ initialized: false });
	expect(requests.map((request) => [request.method, request.path])).toEqual([
		["PROPFIND", "Drone-Knowledge/"],
		["PROPFIND", ""],
	]);
});

it("initializes a missing folder with a collection readback", async () => {
	const state = { created: false };
	const { cloud, requests } = fixture((input) => {
		if (input.method === "MKCOL") {
			state.created = true;
			return reply(201);
		}
		return input.path && !state.created ? reply(404) : collection(input.path);
	});
	expect(await cloud.initialize()).toEqual({ initialized: true });
	expect(requests.map((request) => request.method)).toEqual([
		"PROPFIND",
		"PROPFIND",
		"PROPFIND",
		"MKCOL",
		"PROPFIND",
	]);
});

it("rejects a missing DAV root and never creates the folder", async () => {
	const { cloud, requests } = fixture(() => reply(404));
	await expect(cloud.initialize()).rejects.toMatchObject({ code: "protocol" });
	expect(requests.every((request) => request.method === "PROPFIND")).toBe(true);
});

it.each([
	"../Home.md",
	"/Home.md",
	"Wiki/../note.md",
	"Wiki//note.md",
	"Wiki/.hidden.md",
	"Wiki/a%2fb.md",
	"Wiki/a:b.md",
	"Wiki/a#b.md",
	"Wiki/a?b.md",
	"Wiki/a\\b.md",
	"Wiki/dir./note.md",
	"Wiki/dir /note.md",
	"Wiki/a\u0000.md",
	"Wiki/a\u007f.md",
	"Wiki/results/note.md",
	"Wiki/sessions/note.md",
	"Wiki/credentials.md",
	"Wiki/credential/note.md",
	"Wiki/secret/note.md",
	"Wiki/auth/note.md",
	"Wiki/id_rsa.md",
	"Wiki/secret_key.md",
	"Wiki/node_modules/note.md",
	"Wiki/Templates/note.md",
	"Wiki/Attachments/note.md",
	"wiki/note.md",
	"Home.txt",
	"Other/note.md",
	`Wiki/${"a".repeat(1020)}.md`,
])("rejects path %s before any request", async (path) => {
	const { cloud, requests } = fixture();
	await expect(cloud.read(path)).rejects.toMatchObject({ code: "protocol" });
	await expect(cloud.write({ path, text: "fake" })).rejects.toMatchObject({ code: "protocol" });
	expect(requests).toEqual([]);
});

it.each(["Home.md", "Wiki/note.md", "Library/paper.md", "Projects/fake/note.md", "Inbox/中文 note.md"])(
	"reads allowed note %s with encoded segments and a raw byte hash",
	async (path) => {
		const { cloud, requests } = fixture(() =>
			reply(200, "# fake note\n", { etag: '"v1"', "last-modified": "fake-date" }),
		);
		expect(await cloud.read(path)).toEqual({
			path,
			text: "# fake note\n",
			hash: hash("# fake note\n"),
			version: '"v1"',
			bytes: 12,
			lastModified: "fake-date",
		});
		expect(requests).toEqual([
			{
				method: "GET",
				path: `Drone-Knowledge/${path.split("/").map(encodeURIComponent).join("/")}`,
				headers: { Accept: "text/markdown, text/plain" },
			},
		]);
	},
);

it("keeps the UTF-8 BOM and hashes exactly the received bytes", async () => {
	const { cloud } = fixture(() => reply(200, "\uFEFFfake"));
	expect(await cloud.read("Home.md")).toMatchObject({
		text: "\uFEFFfake",
		hash: hash("\uFEFFfake"),
		bytes: 7,
		version: null,
		lastModified: null,
	});
});

it("rejects invalid UTF-8 and oversized notes", async () => {
	const cloud = new CloudService({
		http: { request: async () => ({ status: 200, headers: {}, body: new Uint8Array([0xff]) }) },
	});
	await expect(cloud.read("Home.md")).rejects.toMatchObject({ code: "protocol" });
	const oversized = fixture(() => reply(200, "x".repeat(1024 * 1024 + 1))).cloud;
	await expect(oversized.read("Home.md")).rejects.toMatchObject({ code: "protocol" });
});

it("accepts exactly 1 MiB and reports absent or weak versions as read-only", async () => {
	const { cloud } = fixture(() => reply(200, "x".repeat(1024 * 1024), { etag: 'W/"x"' }));
	expect(await cloud.read("Home.md")).toMatchObject({ bytes: 1024 * 1024, version: null });
});

it("rejects oversize writes and invalid update versions before any request", async () => {
	const { cloud, requests } = fixture();
	await expect(cloud.write({ path: "Home.md", text: "é".repeat(1024 * 512 + 1) })).rejects.toMatchObject({
		code: "protocol",
	});
	for (const expectedVersion of ['W/"x"', "*", "yesterday", ""])
		await expect(cloud.write({ path: "Home.md", text: "fake", expectedVersion })).rejects.toMatchObject({
			code: "protocol",
		});
	expect(requests).toEqual([]);
});

it.each([200, 201, 204])("creates with If-None-Match and verifies the note after HTTP %i", async (status) => {
	const { cloud, requests } = fixture((input) =>
		input.method === "PROPFIND"
			? collection(input.path)
			: reply(input.method === "PUT" ? status : 200, input.method === "GET" ? "fake" : "", {
					etag: '"v2"',
				}),
	);
	expect(await cloud.write({ path: "Home.md", text: "fake" })).toEqual({
		path: "Home.md",
		status: "created",
		hash: hash("fake"),
		version: '"v2"',
		reason: null,
	});
	expect(requests.map((request) => request.method)).toEqual(["PROPFIND", "PUT", "GET"]);
	expect(requests[1]).toMatchObject({ headers: { "If-None-Match": "*" }, body: "fake" });
});

it("updates with a strong If-Match and ensures nested parents", async () => {
	const { cloud, requests } = fixture((input) =>
		input.method === "PROPFIND" ? collection(input.path) : reply(200, "fake", { etag: '"v2"' }),
	);
	expect(
		await cloud.write({ path: "Wiki/fake/note.md", text: "fake", expectedVersion: '"v1"' }),
	).toMatchObject({ status: "updated", version: '"v2"' });
	expect(requests.filter((request) => request.method === "PROPFIND").map((request) => request.path)).toEqual([
		"Drone-Knowledge/",
		"Drone-Knowledge/Wiki/",
		"Drone-Knowledge/Wiki/fake/",
	]);
	expect(requests.find((request) => request.method === "PUT")?.headers).toEqual({
		"Content-Type": "text/markdown; charset=utf-8",
		"If-Match": '"v1"',
	});
});

it("reports a successful write without a strong ETag with a localization reason", async () => {
	const { cloud } = fixture((input) =>
		input.method === "PROPFIND" ? collection(input.path) : reply(200, "fake"),
	);
	expect(await cloud.write({ path: "Home.md", text: "fake" })).toMatchObject({
		status: "created",
		version: null,
		reason: "missing_strong_etag",
	});
});

it.each([
	[412, "conflict"],
	[401, "forbidden"],
	[403, "forbidden"],
	[500, "unknown"],
])("maps PUT %i to %s without retrying", async (status, expected) => {
	const { cloud, requests } = fixture((input) =>
		input.method === "PROPFIND"
			? collection(input.path)
			: reply(Number(status), "fake-private-body", { "x-fake-detail": "fake-private-header" }),
	);
	const result = await cloud.write({ path: "Home.md", text: "fake-private-request" });
	expect(result.status).toBe(expected);
	expect(requests.filter((request) => request.method === "PUT")).toHaveLength(1);
	expect(JSON.stringify(result)).not.toContain("fake-private");
});

it("reports offline for a throw before PUT starts", async () => {
	const { cloud, requests } = fixture(() => {
		throw new Error("fake-private-detail");
	});
	expect(await cloud.write({ path: "Home.md", text: "fake" })).toMatchObject({
		status: "offline",
		reason: "offline",
	});
	expect(requests.map((request) => request.method)).toEqual(["PROPFIND"]);
});

it("reports unknown for a throw after PUT starts and never retries", async () => {
	const { cloud, requests } = fixture((input) => {
		if (input.method === "PROPFIND") return collection(input.path);
		throw new Error("fake-private-detail");
	});
	expect(await cloud.write({ path: "Home.md", text: "fake" })).toMatchObject({
		status: "unknown",
		reason: "write_unverified",
	});
	expect(requests.map((request) => request.method)).toEqual(["PROPFIND", "PUT"]);
});

it("reports a denied PUT as forbidden without retry or readback", async () => {
	const { cloud, requests } = fixture((input) => {
		if (input.method === "PROPFIND") return collection(input.path);
		throw new CloudError("forbidden");
	});
	expect(await cloud.write({ path: "Home.md", text: "fake" })).toMatchObject({
		status: "forbidden",
		reason: "forbidden",
	});
	expect(requests.map((request) => request.method)).toEqual(["PROPFIND", "PUT"]);
});

it.each(["mismatch", "throw"])(
	"reports unknown on %s during PUT readback without resending",
	async (failure) => {
		const { cloud, requests } = fixture((input) => {
			if (input.method === "PROPFIND") return collection(input.path);
			if (input.method === "PUT") return reply(201);
			if (failure === "throw") throw new Error("fake-private-detail");
			return reply(200, "different fake text");
		});
		expect(await cloud.write({ path: "Home.md", text: "fake" })).toMatchObject({
			status: "unknown",
			reason: "write_unverified",
		});
		expect(requests.map((request) => request.method)).toEqual(["PROPFIND", "PUT", "GET"]);
	},
);

it("requires an initialized folder and propagates read failures as safe codes", async () => {
	const { cloud, requests } = fixture(() => reply(404, "fake-private-body"));
	await expect(cloud.write({ path: "Home.md", text: "fake" })).rejects.toMatchObject({ code: "not_found" });
	await expect(cloud.read("Home.md")).rejects.toEqual(new CloudError("not_found", 404));
	expect(requests.some((request) => request.method === "PUT")).toBe(false);
});

it.each([401, 403, 404, 412, 500])(
	"reports unknown after PUT when readback returns HTTP %i",
	async (status) => {
		const { cloud, requests } = fixture((input) => {
			if (input.method === "PROPFIND") return collection(input.path);
			return reply(input.method === "PUT" ? 201 : status);
		});
		expect(await cloud.write({ path: "Home.md", text: "fake" })).toMatchObject({
			status: "unknown",
			reason: "write_unverified",
		});
		expect(requests.map((request) => request.method)).toEqual(["PROPFIND", "PUT", "GET"]);
	},
);

it("accepts a write at exactly the 1 MiB limit", async () => {
	const text = "x".repeat(1024 * 1024);
	const { cloud } = fixture((input) =>
		input.method === "PROPFIND" ? collection(input.path) : reply(input.method === "PUT" ? 201 : 200, text),
	);
	expect(await cloud.write({ path: "Home.md", text })).toMatchObject({ status: "created", hash: hash(text) });
});
