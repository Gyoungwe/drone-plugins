import { CloudError } from "./cloud.js";

export const KNOWLEDGE_MAX_NOTE_BYTES = 1024 * 1024;

// The existing core/files module also loads filesystem APIs, so this boundary stays pure.
const OMIT = new Set([
	"node_modules",
	"dist",
	"build",
	"out",
	"coverage",
	"vendor",
	"venv",
	"__pycache__",
	"Attachments",
	"Templates",
	"_template",
]);

export function cloudNotePath(path: string): string {
	const parts = path.split("/");
	if (
		path.length > 1024 ||
		path.includes("\\") ||
		/[%:#?]/.test(path) ||
		Array.from(path).some(
			(character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f,
		) ||
		!/^(?:Home\.md|(?:Wiki|Library|Projects|Inbox)\/.+\.md)$/.test(path) ||
		parts.some(
			(part) =>
				!part ||
				part.startsWith(".") ||
				OMIT.has(part) ||
				/[. ]$/.test(part) ||
				/^(?:secrets?|credentials?|id_rsa|id_ed25519)(?:[.\-_]|$)/i.test(part) ||
				/^(?:results|sessions|credentials?|secrets?|auth)(?:\.|$)/i.test(part),
		)
	)
		throw new CloudError("protocol");
	return path;
}
