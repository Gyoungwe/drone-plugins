#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { build } from "esbuild";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { isMainModule } from "../../../scripts/is-main-module.mjs";

async function smokeNative(packageRoot, manifest) {
	const extension = join(packageRoot, manifest.entrypoints.extension);
	const bundle = await readFile(extension, "utf8");
	assert.doesNotMatch(
		bundle,
		/(?:from|import\s*\(|require\s*\()["'](?:electron|@drone\/(?:backend|desktop|shared|tasks))["']/u,
		"pi-core bundle contains host-only import",
	);
	const { default: registerPiCore } = await import(pathToFileURL(extension).href);
	const tools = [];
	const commands = new Set();
	registerPiCore({
		on: () => undefined,
		registerTool(tool) {
			tools.push(tool.name);
		},
		registerCommand(name) {
			commands.add(name);
		},
		events: createEventBus(),
	});
	assert.equal(tools.length, 14);
	assert.deepEqual(tools.toSorted(), manifest.tools.toSorted());
	assert.equal(new Set(tools).size, tools.length);
	for (const name of ["drone-doctor", "drone-example"]) assert.ok(commands.has(name), name);
	const host = await import(pathToFileURL(join(packageRoot, manifest.entrypoints.host)).href);
	assert.equal(typeof host.createWorkbenchRuntime, "function");
}

async function smokeUi(packageRoot, manifest) {
	const path = join(packageRoot, manifest.entrypoints.ui);
	const ui = JSON.parse(await readFile(path, "utf8"));
	assert.equal(ui.version, manifest.version);
	assert.equal(ui.name, "drone-task-ui");
	assert.equal(ui.droneUi, 1);
	assert.equal(ui.main, "bundle.js");
	assert.deepEqual(ui.slots, { "chat.message": "TaskMessage" });
	assert.deepEqual(
		ui.contributions.map((entry) => [entry.id, entry.region, entry.export]),
		[
			["tasks", "panel.tab", "TaskPanel"],
			["workbench", "panel.tab", "WorkbenchPanel"],
			["research-status", "panel.tab", "ResearchStatusPanel"],
		],
	);
	const shims = {
		react: "export const {memo,useState,useEffect,useRef,useCallback,useMemo}=window.DroneUI.React",
		"react/jsx-runtime": "export const {Fragment,jsx,jsxs}=window.DroneUI.jsxRuntime",
	};
	const result = await build({
		entryPoints: [join(dirname(path), ui.main)],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PluginUI",
		platform: "browser",
		plugins: [
			{
				name: "host-react",
				setup(builder) {
					builder.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, (args) => ({
						path: args.path,
						namespace: "host",
					}));
					builder.onLoad({ filter: /.*/, namespace: "host" }, (args) => ({ contents: shims[args.path] }));
				},
			},
		],
	});
	const context = { window: { DroneUI: { React, jsxRuntime } } };
	vm.runInNewContext(result.outputFiles[0].text, context, { timeout: 5000 });
	for (const name of [ui.slots["chat.message"], ...ui.contributions.map((entry) => entry.export)]) {
		const component = context.PluginUI[name];
		const render = component?.$$typeof === Symbol.for("react.memo") ? component.type : component;
		assert.equal(typeof render, "function", name);
	}
}

export async function smokePiCore(packageRoot) {
	const manifest = JSON.parse(await readFile(join(packageRoot, "plugin.manifest.json"), "utf8"));
	await smokeNative(packageRoot, manifest);
	await smokeUi(packageRoot, manifest);
}

if (isMainModule(import.meta.url)) {
	await smokePiCore(resolve(import.meta.dirname, ".."));
	console.log("pi-core native and Desktop UI smoke passed");
}
