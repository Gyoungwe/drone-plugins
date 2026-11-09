/** Drone's manifest parser rules (`network-declaration.ts`); the host attaches the secret as `header`, never a reserved one. */
const RESERVED_HEADER =
	/^(?:host|cookie|connection|keep-alive|transfer-encoding|upgrade|te|trailer|content-length|proxy-.*)$/i;

/** Returns the `drone.credentials` failure messages for one manifest. */
export function credentialFailures(manifest) {
	const slots = manifest.drone?.credentials;
	if (slots === undefined) return [];
	const failures = [];
	if (!manifest.entrypoints?.desktopRuntime)
		failures.push("drone.credentials requires desktopRuntime ownership");
	const hosts = Array.isArray(manifest.permissions?.network) ? manifest.permissions.network : [];
	const text = (value, pattern) => typeof value === "string" && pattern.test(value);
	const valid =
		Array.isArray(slots) &&
		slots.length > 0 &&
		new Set(slots.map((slot) => slot?.slot)).size === slots.length &&
		slots.every(
			(slot) =>
				text(slot?.slot, /^[a-z][a-z0-9-]{0,63}$/) &&
				text(slot.label?.zh, /\S/) &&
				text(slot.label?.en, /\S/) &&
				Array.isArray(slot.hosts) &&
				slot.hosts.length > 0 &&
				slot.hosts.every((host) => hosts.includes(host)) &&
				text(slot.header, /^[A-Za-z][A-Za-z0-9-]{0,127}$/) &&
				!RESERVED_HEADER.test(slot.header) &&
				Array.isArray(slot.fields) &&
				slot.fields.every((field) => text(field, /^[A-Za-z][A-Za-z0-9]{0,63}$/)),
		);
	if (!valid)
		failures.push(
			"drone.credentials must list unique slots with a zh/en label, hosts from permissions.network, a non-reserved header and fields",
		);
	return failures;
}
