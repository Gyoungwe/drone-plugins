#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const bundle = await readFile(resolve(import.meta.dirname, "../dist/index.mjs"), "utf8");
for (const name of [
	"ask_user",
	"set_status",
	"todo",
	"deliver_files",
	"memory_save",
	"task_plan",
	"task_status",
	"task_wait",
	"task_reconcile",
	"task_evidence_restore",
	"drone-doctor",
	"drone-example",
])
	if (!bundle.includes(JSON.stringify(name))) throw new Error(`pi-core smoke: missing ${name}`);
if (/(?:from|import\s*\(|require\s*\()["'](?:electron|@drone\/(?:backend|desktop|shared|tasks))["']/u.test(bundle))
	throw new Error("pi-core bundle contains host-only import");
console.log("pi-core bundle smoke passed");
