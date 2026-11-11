interface ZoteroWriteReceipt {
	doi?: string | null;
	title?: string | null;
	status?: string;
	zoteroKey?: string | null;
	channel?: string;
	library?: { name?: string | null } | null;
	fulltextStatus?: string;
}

const OK = new Set([
	"verified",
	"saved",
	"reused",
	"both-verified",
	"attachment-indexed-not-read",
	"applied",
	"written",
	"note-written",
	"summary-written",
	"explainer-archived",
	"setup-complete",
	"已保存",
	"archived",
	"found",
	"ready",
]);
const ERROR = new Set([
	"failed",
	"identity-mismatch",
	"missing",
	"blocked",
	"cancelled",
	"not-found",
	"error",
]);
const MUTED = new Set(["unknown", "unavailable", "pending"]);
const ZOTERO_KEY = /^[A-Z0-9]{8}$/;
const CHANNEL_LABEL: Record<string, string> = { connector: "连接器", web: "Web API" };
const clip = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : null);

function statusTone(status: string) {
	if (OK.has(status)) return "ok";
	if (ERROR.has(status)) return "error";
	if (MUTED.has(status)) return "muted";
	return "warn";
}

function writeCardFields(receipt: ZoteroWriteReceipt, zoteroKey: string | null) {
	const zoteroStatus =
		receipt.status === "saved" || receipt.status === "reused"
			? "verified"
			: clip(receipt.status, 32) || "unavailable";
	const fulltext = clip(receipt.fulltextStatus, 64) || "unknown";
	const channel = clip(receipt.channel, 16);
	const library = clip(receipt.library?.name, 120);
	return [
		{
			label: "Zotero",
			value: zoteroStatus,
			status: true,
			code: zoteroKey && ZOTERO_KEY.test(zoteroKey) ? zoteroKey : null,
			note: [channel ? CHANNEL_LABEL[channel] || channel : null, library].filter(Boolean).join(" · ") || null,
			tone: statusTone(zoteroStatus),
		},
		{
			label: "Vault 笔记",
			i18n: "flow.field.vaultNote",
			value: "unknown",
			status: true,
			code: null,
			tone: "muted",
		},
		{
			label: "全文",
			i18n: "flow.field.fulltext",
			value: fulltext,
			status: true,
			tone: statusTone(fulltext),
		},
	];
}

function writeCardLinks(doi: string, zoteroKey: string | null) {
	const links = [
		{
			label: "打开 DOI",
			i18n: "flow.link.openDoi",
			kind: "external",
			target: `https://doi.org/${encodeURI(doi)}`,
		},
	];
	if (zoteroKey && ZOTERO_KEY.test(zoteroKey))
		links.unshift({
			label: "在 Zotero 中打开",
			i18n: "flow.link.openInZotero",
			kind: "resource",
			target: `zotero://select/library/items/${zoteroKey}`,
		});
	return links;
}

/** Mirrors the pi-knowledge write card without a plugin dependency; time belongs to the caller. */
export function zoteroLiteratureCard(receipt: ZoteroWriteReceipt, source: string | null, at: number) {
	const doi = clip(receipt.doi, 300);
	if (!doi) return null;
	const zoteroKey = clip(receipt.zoteroKey, 8);
	const title = clip(receipt.title, 200);
	const status = clip(receipt.status, 32) || "unknown";
	return {
		key: `doi:${doi}`,
		kind: "literature",
		title: title || doi.slice(0, 200),
		provisionalTitle: !title,
		subtitle: `DOI ${doi}`.slice(0, 300),
		status,
		tone: statusTone(status),
		detail: null,
		path: null,
		fields: writeCardFields(receipt, zoteroKey),
		links: writeCardLinks(doi, zoteroKey),
		source: clip(source, 80),
		at,
	};
}
