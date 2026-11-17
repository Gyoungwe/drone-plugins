import { expect, it } from "vitest";
import { redactDiagnostic } from "../src/core/redact-diagnostic.js";

const marker = "synthetic-value";

it("keeps the failure visible while redacting authorization and API keys", () => {
	expect(redactDiagnostic(`Synthetic failure: Authorization: Bearer ${marker}; api_key=${marker}`)).toBe(
		"Synthetic failure: Authorization: [redacted] [redacted]; api_key=[redacted]",
	);
});

it("strips URL credentials, queries and fragments while keeping the endpoint", () => {
	expect(
		redactDiagnostic(
			`Synthetic failure at https://synthetic-user:${marker}@example.invalid/v1?token=${marker}#synthetic-fragment`,
		),
	).toBe("Synthetic failure at https://example.invalid/v1");
});

it("omits a URL whose credentials cannot be safely parsed", () => {
	expect(redactDiagnostic(`Synthetic failure at https://[invalid-host?token=${marker}`)).toBe(
		"Synthetic failure at [URL omitted]",
	);
});

it("redacts bearer values case-insensitively without consuming diagnostic separators", () => {
	expect(redactDiagnostic("Synthetic failure: bEaReR synthetic-value, denied; Bearer synthetic-value")).toBe(
		"Synthetic failure: Bearer [redacted], denied; Bearer [redacted]",
	);
});

it.each([
	"api_key",
	"api-key",
	"apikey",
	"access_token",
	"access-token",
	"refresh_token",
	"refresh-token",
	"token",
	"password",
	"secret",
	"Authorization",
	"Cookie",
])("redacts %s values with either assignment separator", (key) => {
	expect(redactDiagnostic(`${key}=synthetic-value; ${key}: synthetic-value, denied`)).toBe(
		`${key}=[redacted]; ${key}: [redacted], denied`,
	);
});

it("redacts quoted keys and values including spaces and unfinished quoted values", () => {
	expect(redactDiagnostic("\"token\": \"synthetic value\"; 'password'='synthetic value'")).toBe(
		"\"token\": [redacted]; 'password'=[redacted]",
	);
	expect(redactDiagnostic('secret="synthetic unfinished value')).toBe("secret=[redacted]");
	expect(redactDiagnostic("secret='synthetic unfinished value")).toBe("secret=[redacted]");
});

it.each(["sk-", "ghp_", "github_pat_"])("redacts a standalone %s token", (prefix) => {
	expect(redactDiagnostic(`Synthetic failure: ${prefix}synthetic_value_123 denied`)).toBe(
		"Synthetic failure: [redacted] denied",
	);
});

it("replaces control characters with spaces", () => {
	const controls = Array.from({ length: 32 }, (_, index) => String.fromCharCode(index)).join("");
	expect(redactDiagnostic(`Synthetic${controls}failure`)).toBe(`Synthetic${" ".repeat(32)}failure`);
});

it("keeps ordinary diagnostic text unchanged", () => {
	expect(redactDiagnostic("Synthetic failure: provider unavailable (503)")).toBe(
		"Synthetic failure: provider unavailable (503)",
	);
});

it("bounds visible diagnostics to 4096 characters", () => {
	expect(redactDiagnostic("x".repeat(9000))).toBe("x".repeat(4096));
});

it("redacts before bounding so long sensitive values cannot hide useful failure text", () => {
	expect(redactDiagnostic(`Synthetic failure: token=${"x".repeat(6000)} denied`)).toBe(
		"Synthetic failure: token=[redacted] denied",
	);
});
