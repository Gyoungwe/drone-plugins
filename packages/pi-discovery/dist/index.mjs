// @ts-nocheck
// src/native-records.ts
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";
var JOURNALS = [
  "sessions",
  "critics",
  "multipath",
  "plans",
  "evaluations",
  "baselines"
];
var MAX_JOURNAL_BYTES = 1048576;
var MAX_RESULTS = 32;
async function readJournal(cwd, journal) {
  if (!JOURNALS.includes(journal)) throw new Error("Unknown discovery journal");
  let path = await realpath(cwd);
  try {
    for (const part of ["runs", ".drone-discovery", `${journal}.json`]) {
      path = join(path, part);
      if ((await lstat(path)).isSymbolicLink())
        throw new Error("Discovery journal path contains a symlink");
    }
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > MAX_JOURNAL_BYTES)
      throw new Error(
        `Discovery journal must be a file of at most ${MAX_JOURNAL_BYTES} bytes`
      );
    const bytes = Buffer.alloc(MAX_JOURNAL_BYTES + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_JOURNAL_BYTES)
      throw new Error("Discovery journal exceeds the byte limit");
    const value = JSON.parse(
      bytes.subarray(0, bytesRead).toString("utf8")
    );
    if (!Array.isArray(value) || value.some(
      (item) => !item || typeof item !== "object" || Array.isArray(item)
    ))
      throw new Error(
        `Discovery journal ${journal} must contain an array of records`
      );
    return value;
  } finally {
    await file.close();
  }
}
async function nativeDiscoveryStatus(cwd) {
  const journals = await Promise.all(
    JOURNALS.map(async (journal) => {
      const records = await readJournal(cwd, journal);
      return {
        journal,
        configured: records !== null,
        count: records?.length ?? 0
      };
    })
  );
  return {
    status: journals.some((item) => item.configured) ? "configured" : "unconfigured",
    readOnly: true,
    journalRoot: "runs/.drone-discovery",
    journals,
    execution: "unavailable",
    inquiry: "unavailable"
  };
}
async function nativeDiscoveryRecords(cwd, journal, query) {
  const records = await readJournal(cwd, journal);
  const needle = query?.trim().toLocaleLowerCase();
  const matches = records?.filter(
    (record) => !needle || JSON.stringify(record).toLocaleLowerCase().includes(needle)
  );
  return {
    status: records === null ? "unconfigured" : "configured",
    journal,
    readOnly: true,
    records: matches?.slice(0, MAX_RESULTS) ?? [],
    count: matches?.length ?? 0,
    truncated: (matches?.length ?? 0) > MAX_RESULTS
  };
}

// src/index.ts
var readMetadata = { drone: { readOnly: true, capabilities: ["research", "analysis"] } };
var journalSchema = { type: "string", enum: JOURNALS };
function result(details) {
  return {
    content: [{ type: "text", text: JSON.stringify(details) }],
    details
  };
}
function discoveryExtension(pi) {
  pi.registerTool({
    name: "discovery_status",
    label: "Discovery \xB7 status",
    ...readMetadata,
    description: "Read existing discovery journal counts in this workspace. Does not configure or execute kernels.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    async execute(_id, _input, _signal, _update, context) {
      return result(await nativeDiscoveryStatus(context.cwd));
    }
  });
  pi.registerTool({
    name: "discovery_list_records",
    label: "Discovery \xB7 records",
    ...readMetadata,
    description: "Read up to 32 existing records from one discovery journal under this workspace's runs/.drone-discovery directory.",
    parameters: {
      type: "object",
      properties: { journal: journalSchema },
      required: ["journal"],
      additionalProperties: false
    },
    async execute(_id, input, _signal, _update, context) {
      return result(await nativeDiscoveryRecords(context.cwd, input.journal));
    }
  });
  pi.registerTool({
    name: "discovery_search_records",
    label: "Discovery \xB7 search",
    ...readMetadata,
    description: "Search existing discovery record JSON in one workspace journal. Returned observations are not independent scientific validation.",
    parameters: {
      type: "object",
      properties: {
        journal: journalSchema,
        query: { type: "string", minLength: 1, maxLength: 2e3 }
      },
      required: ["journal", "query"],
      additionalProperties: false
    },
    async execute(_id, input, _signal, _update, context) {
      const { journal, query } = input;
      return result(await nativeDiscoveryRecords(context.cwd, journal, query));
    }
  });
}
export {
  discoveryExtension as default
};
