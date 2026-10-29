import { createHash } from "node:crypto";

export function canonicalPlanJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalPlanJson).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalPlanJson(record[key])}`).join(",")}}`;
}
export function scientificPlanHash(content: Readonly<Record<string, unknown>>): string {
	return createHash("sha256").update(canonicalPlanJson(content)).digest("hex");
}
