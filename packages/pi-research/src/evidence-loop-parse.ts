import { createHash } from "node:crypto";
import { basename, extname } from "node:path";

export function normalize(value: string): string {
	return value.normalize("NFKC").toLowerCase();
}

export function termsFor(query: string): string[] {
	return [...new Set(normalize(query).match(/[\p{L}\p{N}][\p{L}\p{N}._+-]*/gu) || [])].slice(0, 32);
}

export function safeSegment(value: unknown): string {
	const segment = String(value ?? "").trim();
	if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(segment)) throw new Error("slug must be a simple path segment");
	return segment.toLowerCase();
}

export function parseFrontmatter(text: string): { fields: Record<string, string>; body: string } {
	if (!text.startsWith("---\n")) return { fields: {}, body: text };
	const end = text.indexOf("\n---", 4);
	if (end < 0) return { fields: {}, body: text };
	const fields: Record<string, string> = {};
	for (const line of text.slice(4, end).split(/\r?\n/)) {
		const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*["']?(.+?)["']?\s*$/);
		const key = match?.[1];
		const value = match?.[2];
		if (key && value) fields[key.toLowerCase()] = value.trim();
	}
	return { fields, body: text.slice(end + 4).replace(/^\s+/, "") };
}

export function titleOf(path: string, fields: Record<string, string>, body: string): string {
	return fields.title || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || basename(path, extname(path));
}

export function sourceId(relativePath: string, fields: Record<string, string>, text: string): string {
	const declared = fields.id || fields.source_id;
	if (declared && /^[A-Za-z0-9._:-]{1,120}$/.test(declared)) return declared;
	return `source-${createHash("sha256").update(`${relativePath}\0${text}`).digest("hex").slice(0, 16)}`;
}

export function pageRange(text: string): { start: number; end: number } | undefined {
	const pages = [...text.matchAll(/\[\[page:(\d+)\]\]/gu)].map((match) => Number(match[1]));
	if (!pages.length || pages.some((page) => !Number.isInteger(page) || page < 1)) return undefined;
	return { start: Math.min(...pages), end: Math.max(...pages) };
}

export function citationUri(uri: string, pages: { start: number; end: number } | undefined): string {
	return pages ? `${uri}#page=${pages.start}` : uri;
}

export function selectReadLines(body: string, startLine: unknown, maxChars: number) {
	if (typeof startLine !== "number" || !Number.isInteger(startLine) || startLine < 1)
		throw new Error("start_line must be a positive integer");
	const available = body.split(/\r?\n/);
	if (startLine > available.length) throw new Error("start_line is beyond the source body");
	const selected: string[] = [];
	let chars = 0;
	for (const line of available.slice(startLine - 1)) {
		const width = line.length + (selected.length ? 1 : 0);
		if (chars + width > maxChars) break;
		selected.push(line);
		chars += width;
	}
	if (!selected.length) throw new Error("First requested line exceeds max_chars; no complete line was read");
	return { readText: selected.join("\n"), startLine, endLine: startLine + selected.length - 1 };
}
