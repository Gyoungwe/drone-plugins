import { expect, it } from "vitest";
import { knowledgeEn, knowledgeZh } from "./knowledge/copy";
import { specialistEn, specialistZh } from "./knowledge/specialist-copy";
import { zoteroEn, zoteroZh } from "./knowledge/zotero-copy";
import { en as cloudEn, zh as cloudZh } from "./native-cloud-copy";
import { en as nativeEn, zh as nativeZh } from "./native-copy";

type CopyGroup = Record<string, unknown>;

function isCopyGroup(value: unknown): value is CopyGroup {
	return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function assertNonBlankCopy(value: unknown, location: string): asserts value is string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`${location}: expected a non-blank string`);
	}
}

function placeholders(text: string): string[] {
	return [...new Set(text.match(/\{[a-zA-Z0-9_]+\}/gu))].sort();
}

function expectCopyParity(
	zh: CopyGroup,
	en: CopyGroup,
	location: string,
	nestedKeys: readonly string[] = [],
): void {
	expect(Object.keys(en).sort(), `${location}: en keys must match zh`).toEqual(Object.keys(zh).sort());
	for (const [key, zhValue] of Object.entries(zh)) {
		const enValue = en[key];
		const entry = `${location}:${key}`;
		if (nestedKeys.includes(key)) {
			if (!isCopyGroup(zhValue) || !isCopyGroup(enValue)) {
				throw new Error(`${entry}: expected a copy group in both locales`);
			}
			expectCopyParity(zhValue, enValue, entry);
			continue;
		}
		assertNonBlankCopy(zhValue, `${entry} (zh)`);
		assertNonBlankCopy(enValue, `${entry} (en)`);
		expect(placeholders(enValue), `${entry}: en placeholders must match zh`).toEqual(placeholders(zhValue));
	}
}

it.each<{ file: string; zh: CopyGroup; en: CopyGroup; nestedKeys?: readonly string[] }>([
	{ file: "knowledge/copy.ts", zh: knowledgeZh, en: knowledgeEn },
	{ file: "knowledge/specialist-copy.ts", zh: specialistZh, en: specialistEn },
	{ file: "knowledge/zotero-copy.ts", zh: zoteroZh, en: zoteroEn },
	{ file: "native-cloud-copy.ts", zh: cloudZh, en: cloudEn, nestedKeys: ["items", "reasons"] },
	{ file: "native-copy.ts", zh: nativeZh, en: nativeEn },
])("keeps zh/en copy in parity in $file", ({ file, zh, en, nestedKeys }) => {
	expectCopyParity(zh, en, file, nestedKeys);
});
