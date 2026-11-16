import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { type CloudHttp, CloudService, type CloudVault } from "../src/desktop/cloud.js";
import { type CloudSyncInput, syncCloudNotes } from "../src/desktop/cloud-sync.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
type Request = Parameters<CloudHttp["request"]>[0];
function reply(status: number, body = "", headers: Record<string, string> = {}) {
	return { status, body: new TextEncoder().encode(body), headers };
}
function fixture(
	local: string | null = "fake local",
	remote: string | null = "fake remote",
	version: string | undefined = '"v1"',
) {
	const state = vaultFixture();
	const { locals } = state;
	const remotes = new Map<string, { text: string; version: string | undefined }>();
	if (local !== null) locals.set("Home.md", local);
	if (remote !== null) remotes.set("Home.md", { text: remote, version });
	const requests: Request[] = [];
	const respond = remoteResponder(remotes);
	const http: CloudHttp = {
		request: async (input) => {
			requests.push(input);
			return respond(input);
		},
	};
	const cloud = new CloudService({ http });
	const preview = {
		path: "Home.md",
		localHash: local === null ? null : hash(local),
		remoteHash: remote === null ? null : hash(remote),
		remoteVersion: remote === null ? null : (version ?? null),
	};
	const input: CloudSyncInput = { mode: "push", bindingRevision: 7, paths: ["Home.md"], previews: [preview] };
	return {
		cloud,
		input,
		preview,
		...state,
		remotes,
		requests,
		respond,
	};
}

async function run(f: ReturnType<typeof fixture>, changes: Partial<CloudSyncInput> = {}) {
	return syncCloudNotes(f.cloud, { ...f.input, ...changes }, f.vault);
}

it("pushes only the selected missing note and reports the explicit boundary", async () => {
	const f = fixture("fake local", null);
	f.locals.set("Wiki/unselected.md", "fake unselected");
	expect(await run(f)).toMatchObject({
		completed: true,
		items: [{ status: "pushed" }],
		warnings: ["selected_notes_only"],
	});
	expect(f.requests.every((request) => !request.path.includes("unselected"))).toBe(true);
	expect(f.remotes.has("Wiki/unselected.md")).toBe(false);
	expect(f.readBinding).toHaveBeenCalledWith({ fresh: true });
});

it("deduplicates selected paths without syncing them twice", async () => {
	const f = fixture("fake same", "fake same");
	expect((await run(f, { paths: ["Home.md", "Home.md"] })).items).toHaveLength(1);
	expect(f.requests).toHaveLength(1);
});

it("reports identical notes as unchanged without mutations", async () => {
	const f = fixture("fake same", "fake same");
	expect(await run(f)).toMatchObject({ completed: true, items: [{ status: "unchanged" }] });
	expect(f.requests.map((request) => request.method)).toEqual(["GET"]);
	expect(f.replaceFile).not.toHaveBeenCalled();
});

it.each([{}, { mode: "pull", resolution: "local" }, { resolution: "remote" }] as const)(
	"preserves divergent copies without the matching explicit resolution %j",
	async (changes) => {
		const f = fixture();
		expect(await run(f, changes)).toMatchObject({
			completed: false,
			items: [{ status: "conflict", reason: "divergent" }],
		});
		expect(f.requests.map((request) => request.method)).toEqual(["GET"]);
		expect(f.locals.get("Home.md")).toBe("fake local");
		expect(f.remotes.get("Home.md")?.text).toBe("fake remote");
	},
);

it("resolves toward local using the freshly previewed strong ETag", async () => {
	const f = fixture();
	expect(await run(f, { resolution: "local" })).toMatchObject({
		completed: true,
		items: [{ status: "pushed", remoteVersion: '"v2"' }],
	});
	expect(f.requests.find((request) => request.method === "PUT")).toMatchObject({
		headers: { "If-Match": '"v1"' },
		body: "fake local",
	});
});

it("resolves toward remote with local hash CAS and readback", async () => {
	const f = fixture();
	expect(await run(f, { mode: "pull", resolution: "remote" })).toMatchObject({
		completed: true,
		items: [{ status: "pulled", localHash: hash("fake remote"), reason: "index_pending" }],
	});
	expect(f.replaceFile).toHaveBeenCalledWith("Home.md", "fake remote", {
		expectedHash: hash("fake local"),
	});
	expect(f.locals.get("Home.md")).toBe("fake remote");
});

it("pulls a missing local note using create-only and verifies it", async () => {
	const f = fixture(null);
	expect(await run(f, { mode: "pull" })).toMatchObject({
		completed: true,
		items: [{ status: "pulled", localHash: hash("fake remote") }],
	});
	expect(f.createFileOnly).toHaveBeenCalledWith("Home.md", "fake remote");
});

it.each(["push", "pull"] as const)(
	"requires a strong remote version for %s conflict resolution",
	async (mode) => {
		const f = fixture("fake local", "fake remote", "");
		f.preview.remoteVersion = null;
		expect(await run(f, { mode, resolution: mode === "push" ? "local" : "remote" })).toMatchObject({
			completed: false,
			items: [{ status: "conflict" }],
		});
		expect(f.requests.map((request) => request.method)).toEqual(["GET"]);
		expect(f.replaceFile).not.toHaveBeenCalled();
	},
);

it("requires a strong previewed remote version before creating locally", async () => {
	const f = fixture(null, "fake remote", "");
	f.preview.remoteVersion = null;
	expect((await run(f, { mode: "pull" })).items[0]?.status).toBe("conflict");
	expect(f.createFileOnly).not.toHaveBeenCalled();
});

it.each(["localHash", "remoteHash", "remoteVersion"] as const)(
	"rejects a stale %s preview before mutations",
	async (field) => {
		const f = fixture();
		f.preview[field] = "fake-stale";
		expect((await run(f, { resolution: "local" })).items[0]?.status).toBe("conflict");
		expect(f.requests.map((request) => request.method)).toEqual(["GET"]);
	},
);

it("preserves both copies when local and remote changed after preview", async () => {
	const f = fixture();
	f.locals.set("Home.md", "fake new local");
	f.remotes.set("Home.md", { text: "fake new remote", version: '"v9"' });
	expect((await run(f, { resolution: "local" })).items[0]?.status).toBe("conflict");
	expect(f.requests.map((request) => request.method)).toEqual(["GET"]);
});

it("rejects stale or missing binding before any network", async () => {
	const f = fixture();
	await expect(run(f, { bindingRevision: 6 })).rejects.toMatchObject({ code: "conflict" });
	await expect(
		syncCloudNotes(f.cloud, f.input, { ...f.vault, readBinding: async () => null }),
	).rejects.toMatchObject({ code: "conflict" });
	expect(f.requests).toEqual([]);
});

it.each(["vaultId", "revision"] as const)(
	"fences changed binding %s after the remote read",
	async (field) => {
		const f = fixture();
		f.respond.mockImplementationOnce(() => {
			Object.assign(f.binding, { [field]: field === "vaultId" ? "fake-other" : 8 });
			return reply(200, "fake remote", { etag: '"v1"' });
		});
		expect((await run(f, { resolution: "local" })).items[0]?.status).toBe("conflict");
		expect(f.requests).toHaveLength(1);
	},
);

it.each(["push", "pull"] as const)("rechecks local content before %s mutation", async (mode) => {
	const f = fixture();
	f.readNote.mockImplementationOnce(async () => ({ text: "fake local", hash: hash("fake local") }));
	f.locals.set("Home.md", "fake changed");
	expect((await run(f, { mode, resolution: mode === "push" ? "local" : "remote" })).items[0]?.status).toBe(
		"conflict",
	);
	expect(f.requests.map((request) => request.method)).toEqual(["GET"]);
	expect(f.replaceFile).not.toHaveBeenCalled();
});

it("rechecks local content before pushing to a missing remote", async () => {
	const f = fixture("fake local", null);
	f.readNote.mockImplementationOnce(async () => ({ text: "fake local", hash: hash("fake local") }));
	f.locals.set("Home.md", "fake changed");
	expect((await run(f)).items[0]?.status).toBe("conflict");
	expect(f.requests.map((request) => request.method)).toEqual(["GET"]);
});

it("maps a local CAS race to conflict without overwriting", async () => {
	const f = fixture();
	f.replaceFile.mockRejectedValueOnce(f.casConflict);
	expect((await run(f, { mode: "pull", resolution: "remote" })).items[0]?.status).toBe("conflict");
	expect(f.locals.get("Home.md")).toBe("fake local");
});

it("preserves a local file that appears during create-only pull", async () => {
	const f = fixture(null);
	f.createFileOnly.mockImplementationOnce(async () => {
		f.locals.set("Home.md", "fake appeared");
		return false;
	});
	expect((await run(f, { mode: "pull" })).items[0]?.status).toBe("conflict");
	expect(f.locals.get("Home.md")).toBe("fake appeared");
});

it("does not report success when local write readback differs", async () => {
	const f = fixture(null);
	f.createFileOnly.mockResolvedValueOnce(true);
	expect(await run(f, { mode: "pull" })).toMatchObject({ completed: false, items: [{ status: "failed" }] });
});

it.each(["push", "pull"] as const)("skips an absent %s source without propagating deletion", async (mode) => {
	const f = fixture(mode === "pull" ? "fake local" : null, mode === "push" ? "fake remote" : null);
	expect(await run(f, { mode })).toMatchObject({
		completed: false,
		items: [{ status: "skipped", reason: "source_missing" }],
	});
	expect(f.createFileOnly).not.toHaveBeenCalled();
	expect(f.requests.map((request) => request.method)).toEqual(["GET"]);
});

it.each([
	[412, "conflict"],
	[403, "failed"],
	[500, "failed"],
])("maps conditional push HTTP %i to %s", async (status, expected) => {
	const f = fixture();
	const original = f.respond.getMockImplementation();
	if (!original) throw new Error("Expected fake responder");
	f.respond.mockImplementation((input) => (input.method === "PUT" ? reply(Number(status)) : original(input)));
	expect((await run(f, { resolution: "local" })).items[0]?.status).toBe(expected);
});

it("sanitizes local and remote failures and continues with other selected notes", async () => {
	const f = fixture();
	f.input.paths.push("Wiki/fake.md");
	f.input.previews?.push({ path: "Wiki/fake.md", localHash: null, remoteHash: null, remoteVersion: null });
	f.readNote.mockRejectedValueOnce(new Error("fake-private-detail"));
	const result = await run(f);
	expect(result.items.map((item) => item.status)).toEqual(["failed", "skipped"]);
	expect(JSON.stringify(result)).not.toContain("fake-private-detail");
});

it.each([
	{ paths: [] },
	{ paths: Array(65).fill("Home.md") },
	{ paths: ["Wiki/../note.md"] },
	{ previews: undefined },
	{ previews: [] },
	{ previews: [{ path: "Wiki/other.md", localHash: null, remoteHash: null, remoteVersion: null }] },
])("rejects invalid selection or preview %j before any request", async (changes) => {
	const f = fixture();
	await expect(run(f, changes)).rejects.toHaveProperty("code");
	expect(f.requests).toEqual([]);
});

it("rejects duplicate previews for distinct selected notes", async () => {
	const f = fixture();
	await expect(
		run(f, { paths: ["Home.md", "Wiki/fake.md"], previews: [f.preview, f.preview] }),
	).rejects.toMatchObject({ code: "protocol" });
	expect(f.requests).toEqual([]);
});

function vaultFixture() {
	const locals = new Map<string, string>();
	const binding = { vaultId: "fake-vault", revision: 7, vault: "fake-root" };
	const casConflict = new Error("fake CAS conflict");
	const readBinding = vi.fn(async () => ({ ...binding }));
	const readNote = vi.fn(async (_vault: string, path: string) => {
		const text = locals.get(path);
		if (text === undefined) throw Object.assign(new Error("fake missing note"), { code: "ENOENT" });
		return { text, hash: hash(text) };
	});
	const createFileOnly = vi.fn(async (path: string, text: string) => {
		if (locals.has(path)) return false;
		locals.set(path, text);
		return true;
	});
	const replaceFile = vi.fn(async (path: string, text: string, options: { expectedHash?: string }) => {
		const existing = locals.get(path);
		if (existing === undefined || hash(existing) !== options.expectedHash) throw casConflict;
		locals.set(path, text);
	});
	const vault: CloudVault = {
		readBinding,
		readNote,
		containedFile: async (_vault, path) => path,
		createFileOnly,
		replaceFile,
		isConflict: (error) => error === casConflict,
	};
	return { locals, vault, binding, readBinding, readNote, createFileOnly, replaceFile, casConflict };
}

function remoteResponder(remotes: Map<string, { text: string; version: string | undefined }>) {
	return vi.fn((input: Request) => {
		const path = input.path.split("/").slice(1).map(decodeURIComponent).join("/");
		if (input.method === "PROPFIND")
			return reply(
				207,
				`<d:multistatus xmlns:d="DAV:"><d:response><d:href>/${input.path}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,
			);
		const note = remotes.get(path);
		if (input.method === "PUT") {
			if (input.body === undefined) throw new Error("Expected fake PUT text");
			remotes.set(path, { text: input.body, version: '"v2"' });
			return reply(201, "", { etag: '"v2"' });
		}
		return note ? reply(200, note.text, note.version ? { etag: note.version } : {}) : reply(404);
	});
}

it("fences a binding change during the final local read before push", async () => {
	const f = fixture();
	const local = { text: "fake local", hash: hash("fake local") };
	f.readNote.mockResolvedValueOnce(local).mockImplementationOnce(async () => {
		f.binding.revision++;
		return local;
	});
	expect((await run(f, { resolution: "local" })).items[0]?.status).toBe("conflict");
	expect(f.requests.map((request) => request.method)).toEqual(["GET"]);
});

it("fences a binding change while resolving the contained local target", async () => {
	const f = fixture();
	f.vault.containedFile = async (_root, path) => {
		f.binding.revision++;
		return path;
	};
	expect((await run(f, { mode: "pull", resolution: "remote" })).items[0]?.status).toBe("conflict");
	expect(f.replaceFile).not.toHaveBeenCalled();
});
