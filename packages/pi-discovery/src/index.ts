import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	JOURNALS,
	nativeDiscoveryRecords,
	nativeDiscoveryStatus,
} from "./native-records.js";

const readMetadata = { drone: { readOnly: true, capabilities: ["research", "analysis"] } };
const journalSchema = { type: "string", enum: JOURNALS } as const;

function result(details: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(details) }],
		details,
	};
}

/** Standard Pi entry. Tools read the current session cwd on every call, with no process-global owner. */
export default function discoveryExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "discovery_status",
		label: "Discovery · status",
		...readMetadata,
		description:
			"Read existing discovery journal counts in this workspace. Does not configure or execute kernels.",
		parameters: {
			type: "object",
			properties: {},
			additionalProperties: false,
		} as const,
		async execute(_id, _input, _signal, _update, context) {
			return result(await nativeDiscoveryStatus(context.cwd));
		},
	});
	pi.registerTool({
		name: "discovery_list_records",
		label: "Discovery · records",
		...readMetadata,
		description:
			"Read up to 32 existing records from one discovery journal under this workspace's runs/.drone-discovery directory.",
		parameters: {
			type: "object",
			properties: { journal: journalSchema },
			required: ["journal"],
			additionalProperties: false,
		} as const,
		async execute(_id, input, _signal, _update, context) {
			return result(await nativeDiscoveryRecords(context.cwd, input.journal));
		},
	});
	pi.registerTool({
		name: "discovery_search_records",
		label: "Discovery · search",
		...readMetadata,
		description:
			"Search existing discovery record JSON in one workspace journal. Returned observations are not independent scientific validation.",
		parameters: {
			type: "object",
			properties: {
				journal: journalSchema,
				query: { type: "string", minLength: 1, maxLength: 2000 },
			},
			required: ["journal", "query"],
			additionalProperties: false,
		} as const,
		async execute(_id, input, _signal, _update, context) {
			const { journal, query } = input;
			return result(await nativeDiscoveryRecords(context.cwd, journal, query));
		},
	});
}
