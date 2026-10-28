import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url),
	root = resolve(import.meta.dirname, ".."),
	check = process.argv.includes("--check");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex"),
	inputs = {},
	outputs = {};
async function output(name, bytes) {
	outputs[name] = hash(bytes);
	const path = join(root, name);
	if (check) {
		if (!Buffer.from(await readFile(path)).equals(Buffer.from(bytes)))
			throw new Error(`Stale Inquiry artifact: ${name}`);
	} else {
		await mkdir(join(root, "dist"), { recursive: true });
		await writeFile(path, bytes);
	}
}
for (const [entry, name] of [
	["index", "host"],
	["domain", "domain"],
	["ledger-owner", "ledger-owner"],
	["runtime", "runtime"],
	["native-entry", "index"],
	["wasm-storage", "wasm-storage"],
]) {
	const result = await build({
		absWorkingDir: root,
		entryPoints: [`src/${entry}.ts`],
		bundle: true,
		external: ["@gyoungwe/plugin-api", "@gyoungwe/plugin-api/*"],
		platform: "node",
		format: "esm",
		write: false,
		metafile: true,
		logLevel: "silent",
		plugins: [
			{
				name: "packaged-sqlite-wasm",
				setup(builder) {
					builder.onResolve({ filter: /^sql\.js$/ }, () => ({
						path: "./sql-wasm.cjs",
						external: true,
					}));
				},
			},
		],
	});
	for (const input of Object.keys(result.metafile.inputs).sort())
		inputs[input] = hash(await readFile(resolve(root, input)));
	await output(`dist/${name}.mjs`, result.outputFiles[0].contents);
}
for (const [source, target] of [
	["sql.js/dist/sql-wasm.js", "sql-wasm.cjs"],
	["sql.js/dist/sql-wasm.wasm", "sql-wasm.wasm"],
	["sql.js/LICENSE", "SQLJS-LICENSE"],
]) {
	const path =
			source === "sql.js/LICENSE"
				? resolve(
						dirname(require.resolve("sql.js/dist/sql-wasm.js")),
						"../LICENSE",
					)
				: require.resolve(source),
		bytes = await readFile(path);
	inputs[source] = hash(bytes);
	await output(`dist/${target}`, bytes);
}
const manifest =
	JSON.stringify(
		{
			version: 1,
			generator: "packages/pi-inquiry/scripts/build.mjs",
			inputs,
			outputs,
		},
		null,
		2,
	) + "\n";
if (check) {
	if ((await readFile(join(root, "build-manifest.json"), "utf8")) !== manifest)
		throw new Error("Stale Inquiry build manifest");
} else await writeFile(join(root, "build-manifest.json"), manifest);
console.log(`Inquiry canonical artifacts ${check ? "verified" : "built"}`);
