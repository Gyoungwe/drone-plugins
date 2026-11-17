export function redactDiagnostic(value: string): string {
	return value
		.slice(0, 8192)
		.replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
			let url: URL;
			try {
				url = new URL(raw);
			} catch {
				return "[URL omitted]";
			}
			url.username = "";
			url.password = "";
			url.search = "";
			url.hash = "";
			return url.toString();
		})
		.replace(/bearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
		.replace(
			/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie)["']?\s*[=:]\s*)(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s,;]+)/gi,
			"$1[redacted]",
		)
		.replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}/g, "[redacted]")
		.split("")
		.map((character) => (character.charCodeAt(0) < 32 ? " " : character))
		.join("")
		.slice(0, 4096);
}
