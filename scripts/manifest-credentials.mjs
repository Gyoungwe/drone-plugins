/** Drone's manifest parser rules (`network-declaration.ts`); credential headers must never be reserved. */
const RESERVED_HEADER =
	/^(?:host|cookie|connection|keep-alive|transfer-encoding|upgrade|te|trailer|content-length|proxy-.*)$/i;

/**
 * Keys that look like a credential grant but are not one.
 *
 * The host owns the map from a custody kind to a secret it keeps; a manifest that
 * names a variable would let a package point the host at any secret in its
 * environment, so these are refused rather than ignored.
 */
const REFUSED_SLOT_KEYS = ["custodySource", "secretSource", "envVar"];
const CUSTODY_VALUES = new Set(["user", "host-environment"]);

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
	if (
		valid &&
		slots.some(
			(slot) =>
				Object.hasOwn(slot, "authentication") &&
				(slot.authentication !== "http-basic-digest" ||
					slot.header !== "Authorization" ||
					slot.fields.length !== 0),
		)
	)
		failures.push(
			'drone.credentials authentication must be "http-basic-digest" with header Authorization and empty fields',
		);
	if (valid && slots.some((slot) => Object.keys(slot).some((key) => REFUSED_SLOT_KEYS.includes(key))))
		failures.push(`drone.credentials must not name a secret source: ${REFUSED_SLOT_KEYS.join(", ")}`);
	if (valid && slots.some((slot) => Object.hasOwn(slot, "custody") && !CUSTODY_VALUES.has(slot.custody)))
		failures.push('drone.credentials custody must be "user" or "host-environment" when declared');
	return failures;
}

/**
 * `drone.networkPolicy`: what the package may ask the user to approve at install.
 *
 * The named slot must exist in `drone.credentials` — a policy that names a slot
 * the package never declared is a manifest mistake, not a policy.
 */
export function networkPolicyFailures(manifest) {
	const policy = manifest.drone?.networkPolicy;
	if (policy === undefined) return [];
	const failures = [];
	if (!manifest.entrypoints?.desktopRuntime)
		failures.push("drone.networkPolicy requires desktopRuntime ownership");
	const endpoint = policy?.runtimeEndpoint;
	if (endpoint === undefined || typeof endpoint !== "object") {
		failures.push("drone.networkPolicy must declare runtimeEndpoint");
		return failures;
	}
	if (endpoint.allowed !== true) failures.push("drone.networkPolicy.runtimeEndpoint.allowed must be true");
	const slot = endpoint.credentialSlot;
	if (typeof slot !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(slot)) {
		failures.push("drone.networkPolicy.runtimeEndpoint.credentialSlot must be a slot name");
		return failures;
	}
	const declared = Array.isArray(manifest.drone?.credentials) ? manifest.drone.credentials : [];
	if (!declared.some((entry) => entry?.slot === slot))
		failures.push(
			`drone.networkPolicy.runtimeEndpoint.credentialSlot must name a declared credential slot: ${slot}`,
		);
	return failures;
}
