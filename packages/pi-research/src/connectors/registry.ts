import type {
	ConnectorAccessDeclaration,
	ConnectorCapability,
	ConnectorCredentialDeclaration,
	ConnectorDescriptor,
	ConnectorHost,
	ConnectorKind,
	ConnectorNetworkDeclaration,
	ConnectorPermissionDeclaration,
} from "./contracts.js";
import { DEFAULT_CONNECTOR_DESCRIPTORS, freezeConnectorDescriptor } from "./descriptors.js";

export { DEFAULT_CONNECTOR_DESCRIPTORS, defaultConnectorDescriptors } from "./descriptors.js";

export interface ConnectorPermissionAudit {
	readonly id: string;
	readonly kind: ConnectorKind;
	readonly hosts: readonly ConnectorHost[];
	readonly capabilities: readonly ConnectorCapability[];
	readonly network: ConnectorNetworkDeclaration;
	readonly credentials: ConnectorCredentialDeclaration;
	readonly access: ConnectorAccessDeclaration;
	readonly readOnly: boolean;
	readonly externalSideEffects: ConnectorPermissionDeclaration["externalSideEffects"];
	readonly enabledByDefault: boolean;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/u;

function nonEmpty(value: string, label: string): void {
	if (!value.trim()) throw new Error(`${label} must be a non-empty string`);
}

function unique(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate values`);
}

function validatePermissions(id: string, permissions: ConnectorPermissionDeclaration): void {
	if (!permissions.capabilities.length) throw new Error(`Connector ${id} must declare capabilities`);
	if (!permissions.hosts.length) throw new Error(`Connector ${id} must declare at least one host`);
	unique(permissions.capabilities, `${id} capabilities`);
	unique(permissions.hosts, `${id} hosts`);
	unique(permissions.network.allowedHosts, `${id} network.allowedHosts`);
	unique(permissions.credentials.sources, `${id} credential sources`);
	unique(permissions.authorization.requiredFor, `${id} authorization.requiredFor`);
	unique(permissions.externalSideEffects, `${id} externalSideEffects`);
	if (!permissions.access.read && !permissions.access.write && !permissions.access.delete)
		throw new Error(`Connector ${id} must declare at least one access mode`);
	const expectedReadOnly = !permissions.access.write && !permissions.access.delete;
	if (permissions.readOnly !== expectedReadOnly)
		throw new Error(`Connector ${id} readOnly must match write/delete access`);
	if (permissions.network.mode === "none") {
		if (permissions.network.allowedHosts.length || permissions.network.hostAllowlistRequired)
			throw new Error(`Connector ${id} network=none cannot declare hosts or an allowlist`);
	} else {
		if (!permissions.network.allowedHosts.length)
			throw new Error(`Connector ${id} network access requires an explicit host label`);
		if (!permissions.network.hostAllowlistRequired)
			throw new Error(`Connector ${id} network access must require a host allowlist`);
	}
	if (!permissions.credentials.required && permissions.credentials.sources.includes("none")) {
		if (permissions.credentials.sources.length !== 1)
			throw new Error(`Connector ${id} cannot mix none and credential sources`);
	} else if (permissions.credentials.required && permissions.credentials.sources.includes("none")) {
		throw new Error(`Connector ${id} cannot require credentials from source none`);
	}
	for (const host of permissions.hosts) {
		if (host !== "native-pi" && host !== "drone-desktop")
			throw new Error(`Connector ${id} declares an unknown host: ${host}`);
	}
}

export function validateConnectorDescriptor(descriptor: ConnectorDescriptor): void {
	if (!ID_PATTERN.test(descriptor.id)) throw new Error(`Invalid connector id: ${descriptor.id}`);
	nonEmpty(descriptor.version, `${descriptor.id} version`);
	nonEmpty(descriptor.label, `${descriptor.id} label`);
	nonEmpty(descriptor.description, `${descriptor.id} description`);
	validatePermissions(descriptor.id, descriptor.permissions);
}

export class ConnectorRegistry {
	private readonly descriptors = new Map<string, ConnectorDescriptor>();

	constructor(descriptors: readonly ConnectorDescriptor[] = DEFAULT_CONNECTOR_DESCRIPTORS) {
		for (const descriptor of descriptors) this.register(descriptor);
	}

	register(descriptor: ConnectorDescriptor): void {
		validateConnectorDescriptor(descriptor);
		const frozen = freezeConnectorDescriptor(descriptor);
		if (this.descriptors.has(frozen.id)) throw new Error(`Connector already registered: ${frozen.id}`);
		this.descriptors.set(frozen.id, frozen);
	}

	get(id: string): ConnectorDescriptor | undefined {
		return this.descriptors.get(id);
	}

	require(id: string): ConnectorDescriptor {
		const descriptor = this.get(id);
		if (!descriptor) throw new Error(`Unknown connector: ${id}`);
		return descriptor;
	}

	list(): readonly ConnectorDescriptor[] {
		return [...this.descriptors.values()].sort((left, right) => left.id.localeCompare(right.id));
	}

	findByKind(kind: ConnectorKind): readonly ConnectorDescriptor[] {
		return this.list().filter((descriptor) => descriptor.kind === kind);
	}

	forHost(host: ConnectorHost): readonly ConnectorDescriptor[] {
		return this.list().filter((descriptor) => descriptor.permissions.hosts.includes(host));
	}

	permissionAudit(): readonly ConnectorPermissionAudit[] {
		return this.list().map((descriptor) => ({
			id: descriptor.id,
			kind: descriptor.kind,
			hosts: descriptor.permissions.hosts,
			capabilities: descriptor.permissions.capabilities,
			network: descriptor.permissions.network,
			credentials: descriptor.permissions.credentials,
			access: descriptor.permissions.access,
			readOnly: descriptor.permissions.readOnly,
			externalSideEffects: descriptor.permissions.externalSideEffects,
			enabledByDefault: descriptor.enabledByDefault,
		}));
	}
}

export function createConnectorRegistry(descriptors?: readonly ConnectorDescriptor[]): ConnectorRegistry {
	return new ConnectorRegistry(descriptors);
}
