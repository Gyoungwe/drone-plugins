import type { ConnectorDescriptor } from "./contracts.js";

const readOnlyAuthorization = Object.freeze({ requiredFor: [] as const });

export const DEFAULT_CONNECTOR_DESCRIPTORS: readonly ConnectorDescriptor[] = [
	{
		id: "zotero",
		version: "1",
		kind: "citation",
		label: "Zotero",
		description: "Read Zotero library metadata and citation records through a host-owned API adapter.",
		permissions: {
			capabilities: ["search", "read", "resolve"],
			hosts: ["native-pi", "drone-desktop"],
			network: {
				mode: "public",
				allowedHosts: ["api.zotero.org"],
				hostAllowlistRequired: true,
			},
			credentials: {
				required: false,
				sources: ["host-secret-store", "environment"],
				references: ["zotero-api-key"],
			},
			access: { read: true, write: false, delete: false },
			readOnly: true,
			authorization: readOnlyAuthorization,
			externalSideEffects: [],
		},
		enabledByDefault: false,
	},
	{
		id: "webdav",
		version: "1",
		kind: "storage",
		label: "WebDAV",
		description: "Read files and directory metadata from a configured WebDAV endpoint.",
		permissions: {
			capabilities: ["list", "read", "resolve"],
			hosts: ["native-pi", "drone-desktop"],
			network: {
				mode: "configured",
				allowedHosts: ["configured-webdav-host"],
				hostAllowlistRequired: true,
			},
			credentials: {
				required: true,
				sources: ["host-secret-store", "environment"],
				references: ["webdav-credential-ref"],
			},
			access: { read: true, write: false, delete: false },
			readOnly: true,
			authorization: readOnlyAuthorization,
			externalSideEffects: [],
		},
		enabledByDefault: false,
	},
	{
		id: "generic-mcp",
		version: "1",
		kind: "mcp",
		label: "Generic MCP",
		description:
			"Discover and invoke host-selected read-only MCP tools; server writes require a separate host contract.",
		permissions: {
			capabilities: ["discover", "read", "invoke"],
			hosts: ["native-pi", "drone-desktop"],
			network: {
				mode: "configured",
				allowedHosts: ["host-configured-mcp-endpoint"],
				hostAllowlistRequired: true,
			},
			credentials: {
				required: false,
				sources: ["mcp-config", "host-secret-store"],
				references: ["mcp-server-config"],
			},
			access: { read: true, write: false, delete: false },
			readOnly: true,
			authorization: {
				requiredFor: ["invoke"],
				reason: "The host must approve each selected MCP tool surface.",
			},
			externalSideEffects: [],
		},
		enabledByDefault: false,
	},
	{
		id: "institutional",
		version: "1",
		kind: "institutional",
		label: "Institutional access",
		description:
			"Resolve and read institutionally accessible sources through a host-managed session or browser handoff.",
		permissions: {
			capabilities: ["search", "read", "resolve", "browser-handoff"],
			hosts: ["native-pi", "drone-desktop"],
			network: {
				mode: "institutional",
				allowedHosts: ["configured-institutional-host"],
				hostAllowlistRequired: true,
			},
			credentials: {
				required: true,
				sources: ["browser-session", "oauth"],
				references: ["institutional-session-ref"],
			},
			access: { read: true, write: false, delete: false },
			readOnly: true,
			authorization: {
				requiredFor: ["browser-handoff"],
				reason: "A human-approved browser handoff is required for login or challenge pages.",
			},
			externalSideEffects: ["browser-navigation"],
		},
		enabledByDefault: false,
	},
	{
		id: "search",
		version: "1",
		kind: "search",
		label: "External search",
		description: "Search declared public providers and return provider-neutral source leads with receipts.",
		permissions: {
			capabilities: ["search", "read", "resolve"],
			hosts: ["native-pi", "drone-desktop"],
			network: {
				mode: "public",
				allowedHosts: ["declared-search-provider"],
				hostAllowlistRequired: true,
			},
			credentials: { required: false, sources: ["none"] },
			access: { read: true, write: false, delete: false },
			readOnly: true,
			authorization: readOnlyAuthorization,
			externalSideEffects: [],
		},
		enabledByDefault: false,
	},
	{
		id: "arxiv",
		version: "1",
		kind: "search",
		label: "arXiv",
		description: "Read public arXiv metadata and source links through a host-owned search adapter.",
		permissions: {
			capabilities: ["search", "read", "resolve"],
			hosts: ["native-pi", "drone-desktop"],
			network: {
				mode: "public",
				allowedHosts: ["export.arxiv.org", "arxiv.org"],
				hostAllowlistRequired: true,
			},
			credentials: { required: false, sources: ["none"] },
			access: { read: true, write: false, delete: false },
			readOnly: true,
			authorization: readOnlyAuthorization,
			externalSideEffects: [],
		},
		enabledByDefault: true,
	},
	{
		id: "semantic-scholar",
		version: "1",
		kind: "search",
		label: "Semantic Scholar",
		description:
			"Read public Semantic Scholar paper metadata and citation links through a host-owned adapter.",
		permissions: {
			capabilities: ["search", "read", "resolve"],
			hosts: ["native-pi", "drone-desktop"],
			network: {
				mode: "public",
				allowedHosts: ["api.semanticscholar.org"],
				hostAllowlistRequired: true,
			},
			credentials: { required: false, sources: ["none"] },
			access: { read: true, write: false, delete: false },
			readOnly: true,
			authorization: readOnlyAuthorization,
			externalSideEffects: [],
		},
		enabledByDefault: true,
	},
	{
		id: "browser",
		version: "1",
		kind: "browser",
		label: "Browser source reader",
		description: "Read an explicitly approved browser target and return a bounded source receipt.",
		permissions: {
			capabilities: ["search", "read", "browser-handoff"],
			hosts: ["native-pi", "drone-desktop"],
			network: {
				mode: "public",
				allowedHosts: ["host-approved-navigation-target"],
				hostAllowlistRequired: true,
			},
			credentials: { required: false, sources: ["browser-session"] },
			access: { read: true, write: false, delete: false },
			readOnly: true,
			authorization: {
				requiredFor: ["browser-handoff"],
				reason: "Navigation must be explicitly approved by the host/user.",
			},
			externalSideEffects: ["browser-navigation"],
		},
		enabledByDefault: false,
	},
] as const;

export function freezeConnectorDescriptor(input: ConnectorDescriptor): ConnectorDescriptor {
	const network = Object.freeze({
		...input.permissions.network,
		allowedHosts: Object.freeze([...input.permissions.network.allowedHosts]),
	});
	const credentials = Object.freeze({
		...input.permissions.credentials,
		sources: Object.freeze([...input.permissions.credentials.sources]),
		...(input.permissions.credentials.references
			? { references: Object.freeze([...input.permissions.credentials.references]) }
			: {}),
	});
	const authorization = Object.freeze({
		...input.permissions.authorization,
		requiredFor: Object.freeze([...input.permissions.authorization.requiredFor]),
	});
	const permissions = Object.freeze({
		...input.permissions,
		capabilities: Object.freeze([...input.permissions.capabilities]),
		hosts: Object.freeze([...input.permissions.hosts]),
		network,
		credentials,
		access: Object.freeze({ ...input.permissions.access }),
		authorization,
		externalSideEffects: Object.freeze([...input.permissions.externalSideEffects]),
	});
	return Object.freeze({ ...input, permissions });
}

export function defaultConnectorDescriptors(): readonly ConnectorDescriptor[] {
	return DEFAULT_CONNECTOR_DESCRIPTORS.map(freezeConnectorDescriptor);
}
