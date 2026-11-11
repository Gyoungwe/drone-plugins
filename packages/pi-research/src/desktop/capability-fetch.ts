/**
 * `fetch` for the Drone Desktop managed runtime, whose process has no network: every request goes
 * through the host's `network.read` / `network.write` capabilities, which admit only the hosts this
 * package declares in `permissions.network`. Shaped like `fetch` so the Zotero runtime's existing
 * `fetchImpl` seams take it unchanged.
 */
export type CapabilityCall = (name: string, input: unknown, signal?: AbortSignal) => Promise<unknown>;

export interface CapabilityCredential {
	readonly slot: string;
	readonly header: string;
	readonly hosts: readonly string[];
	readonly match?: (url: URL, method: string) => boolean;
}

export interface CapabilityFetchOptions {
	/** "host/path" POST endpoints that only read; must equal the manifest's `drone.networkReads`. */
	readonly reads?: readonly string[];
	/** Shown in the host's write dialog as this plugin's description of the write. */
	readonly summary?: string;
	/** A task grant allowance this write uses instead of the host's dialog (each is admitted once). */
	readonly allowance?: string;
	/**
	 * Manifest `drone.credentials` slots. Reserved headers are dropped toward their hosts even when a
	 * request does not match; only matching requests name a slot for the host to attach its secret.
	 */
	readonly credentials?: readonly CapabilityCredential[];
}

interface NetworkResult {
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly base64: string;
}

const READ_METHODS = new Set(["GET", "HEAD"]);
/** Statuses whose Response must not carry a body. */
const NO_BODY = new Set([101, 204, 205, 304]);

export function capabilityFetch(
	call: CapabilityCall,
	{ reads = [], summary, allowance, credentials = [] }: CapabilityFetchOptions = {},
): typeof fetch {
	return async (input, init) => {
		// Request normalizes every body type (string, URLSearchParams, Buffer) and its content type.
		const request = new Request(input, init);
		const url = new URL(request.url);
		const read =
			READ_METHODS.has(request.method) ||
			(request.method === "POST" && reads.includes(`${url.host}${url.pathname}`));
		const body = READ_METHODS.has(request.method) ? undefined : Buffer.from(await request.arrayBuffer());
		const hostCredentials = credentials.filter((credential) => credential.hosts.includes(url.host));
		const slot = hostCredentials.find(
			(credential) => !credential.match || credential.match(url, request.method),
		);
		const headers: Record<string, string> = {};
		request.headers.forEach((value, name) => {
			if (!hostCredentials.some((credential) => name === credential.header.toLowerCase()))
				headers[name] = value;
		});
		const result = (await call(
			read ? "network.read" : "network.write",
			{
				method: request.method,
				url: request.url,
				headers,
				...(body?.length ? { bodyBase64: body.toString("base64") } : {}),
				...(!read && summary ? { summary } : {}),
				...(!read && allowance ? { allowance } : {}),
				...(slot ? { credential: slot.slot } : {}),
			},
			request.signal,
		)) as NetworkResult;
		const bytes =
			NO_BODY.has(result.status) || request.method === "HEAD" ? null : Buffer.from(result.base64, "base64");
		return new Response(bytes, { status: result.status, headers: result.headers });
	};
}
