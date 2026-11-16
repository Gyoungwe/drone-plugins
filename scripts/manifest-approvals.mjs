const FILESYSTEM_PERMISSIONS = new Set([
	"workspace-read",
	"workspace",
	"workspace-write",
	"configured-vault",
	"configured-vault-write",
	"vault-read",
	"application-state",
	"application-state-write",
	"binary-state-read",
	"binary-state-write",
]);
const MODEL_PERMISSIONS = new Set(["background-model-spend"]);

export const APPROVAL_CATEGORIES = new Set(["subprocess-install", "background-model-spend"]);

export function approvalPermissionFailures(permissions) {
	const failures = [];
	for (const [key, allowed] of [
		["filesystem", FILESYSTEM_PERMISSIONS],
		["model", MODEL_PERMISSIONS],
	]) {
		const values = permissions[key];
		if (values === undefined) continue;
		if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
			failures.push(`permissions.${key} must be an array of strings`);
			continue;
		}
		for (const value of values)
			if (!allowed.has(value)) failures.push(`permissions.${key} has invalid value ${value}`);
		if (key === "model" && new Set(values).size !== values.length)
			failures.push("permissions.model must be unique");
	}
	return failures;
}
