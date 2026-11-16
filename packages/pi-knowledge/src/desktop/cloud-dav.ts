import { DOMParser } from "@xmldom/xmldom";
import { CloudError, type CloudHttp, httpError } from "./cloud.js";

export function strongEtag(value: string | null | undefined): string | null {
	return value && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value) && value.length <= 1024 ? value : null;
}

function invalid(): never {
	throw new CloudError("protocol");
}

function parseMultistatus(body: Uint8Array) {
	if (body.byteLength > 64 * 1024) invalid();
	const xml = new TextDecoder().decode(body);
	if (/<!DOCTYPE|<!ENTITY/i.test(xml)) invalid();
	let document: ReturnType<DOMParser["parseFromString"]>;
	try {
		document = new DOMParser({
			errorHandler: { warning: invalid, error: invalid, fatalError: invalid },
		}).parseFromString(xml, "application/xml");
	} catch {
		// Parser diagnostics may contain response content; expose only the protocol code.
		return invalid();
	}
	if (
		document.documentElement?.namespaceURI !== "DAV:" ||
		document.documentElement.localName !== "multistatus"
	)
		invalid();
	return document;
}

function hrefTarget(href: string, expected: URL): URL {
	try {
		return new URL(href, expected);
	} catch {
		return invalid();
	}
}

function isCollection(body: Uint8Array, expected: URL): boolean {
	const document = parseMultistatus(body);
	for (const item of Array.from(document.getElementsByTagNameNS("DAV:", "response"))) {
		const href = item.getElementsByTagNameNS("DAV:", "href").item(0)?.textContent;
		if (!href) continue;
		const target = hrefTarget(href, expected);
		if (
			target.origin !== expected.origin ||
			target.pathname.replace(/\/$/, "") !== expected.pathname.replace(/\/$/, "")
		)
			continue;
		const directStatus = Array.from(item.getElementsByTagNameNS("DAV:", "status")).find(
			(element) => element.parentNode === item,
		);
		if (directStatus) throw httpError(Number(directStatus.textContent?.split(" ")[1]));
		for (const prop of Array.from(item.getElementsByTagNameNS("DAV:", "propstat"))) {
			const status = prop.getElementsByTagNameNS("DAV:", "status").item(0)?.textContent;
			if (!status || !/^HTTP\/\S+ 200(?: |$)/.test(status)) continue;
			if (
				prop.getElementsByTagNameNS("DAV:", "resourcetype").length &&
				prop.getElementsByTagNameNS("DAV:", "collection").length
			)
				return true;
		}
		invalid();
	}
	return invalid();
}

export class CloudDav {
	constructor(
		private readonly http: CloudHttp,
		private readonly endpoint: string,
	) {}

	async request(input: Parameters<CloudHttp["request"]>[0]): ReturnType<CloudHttp["request"]> {
		try {
			return await this.http.request(input);
		} catch {
			// A thrown port request has no known HTTP outcome; never expose transport details.
			throw new CloudError("offline");
		}
	}

	async collection(path: string): Promise<boolean> {
		const result = await this.request({
			method: "PROPFIND",
			path,
			headers: { Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
			body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
		});
		if (result.status === 404) return false;
		if (result.status !== 200 && result.status !== 207) throw httpError(result.status);
		return isCollection(result.body, new URL(`${this.endpoint}/${path}`));
	}

	async ensureCollection(path: string): Promise<void> {
		if (await this.collection(path)) return;
		const result = await this.request({ method: "MKCOL", path });
		if (result.status !== 201 && result.status !== 405) throw httpError(result.status);
		// A competing client or same-name file can explain 405; only readback proves a collection.
		if (!(await this.collection(path))) invalid();
	}
}
